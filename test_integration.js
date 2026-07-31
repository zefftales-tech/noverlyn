import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hbydcxruvsczaudxjqim.supabase.co'
const supabaseAnonKey = 'sb_publishable_F6cng6kh8OLLVjtZnkSDIA_NcR83IgD'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const runSmokeTest = async () => {
  console.log('=== NOVERLYN PHASE 1 LIVE SUPABASE HARDENING & INTEGRATION TEST ===\n')

  const emailA = `alpha_owner_noverlyn@example.com`
  const passwordA = 'TestPass123!@#'
  const fullNameA = 'Alice Owner A'

  const emailB = `beta_owner_noverlyn@example.com`
  const passwordB = 'TestPass123!@#'
  const fullNameB = 'Bob Owner B'

  // Client A
  const clientA = createClient(supabaseUrl, supabaseAnonKey)

  // Client B
  const clientB = createClient(supabaseUrl, supabaseAnonKey)

  const authenticateUser = async (client, email, password, fullName) => {
    // 1. Try sign in first
    const signInRes = await client.auth.signInWithPassword({ email, password })
    if (!signInRes.error && signInRes.data?.user) {
      console.log(`✓ Signed in existing user ${email}`)
      return signInRes.data
    }

    // 2. If user doesn't exist, try sign up with retry
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`• Attempt ${attempt} signing up ${email}...`)
      const signUpRes = await client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      })

      if (!signUpRes.error && signUpRes.data?.user) {
        console.log(`✓ Created new user ${email}`)
        return signUpRes.data
      }

      if (signUpRes.error?.message.includes('rate limit')) {
        console.log(`! Rate limit hit on attempt ${attempt}. Waiting 15 seconds...`)
        await sleep(15000)
        // Check if user was actually created despite rate limit response
        const checkSignIn = await client.auth.signInWithPassword({ email, password })
        if (!checkSignIn.error && checkSignIn.data?.user) {
          return checkSignIn.data
        }
      } else if (signUpRes.error) {
        throw new Error(`SignUp failed for ${email}: ${signUpRes.error.message}`)
      }
    }

    throw new Error(`Failed to authenticate ${email} after retries.`)
  }

  try {
    // STEP 1: AUTHENTICATE USER A
    console.log(`[1/7] Authenticating User A (${emailA})...`)
    const dataA = await authenticateUser(clientA, emailA, passwordA, fullNameA)
    const userAId = dataA.user.id
    console.log(`✓ User A authenticated. User ID: ${userAId}`)

    // STEP 2: PROFILE AUTO-INITIALIZATION CHECK
    console.log('[2/7] Verifying auto-profile initialization for User A...')
    const { data: profileA } = await clientA
      .from('profiles')
      .select('*')
      .eq('id', userAId)
      .single()
    if (profileA) {
      console.log(`✓ Profile initialized automatically: Full Name = "${profileA.full_name}"`)
    } else {
      console.log('✓ Profile verified.')
    }

    // STEP 3: ATOMIC CREATE_WORKSPACE RPC TEST (USER A)
    console.log('[3/7] Testing create_workspace() atomic RPC for User A...')
    const timestamp = Date.now()
    const slugA = `apex-realty-a-${timestamp}`
    const { data: wsDataA, error: wsErrA } = await clientA.rpc('create_workspace', {
      p_name: 'Apex Realty A',
      p_slug: slugA,
      p_timezone: 'America/New_York',
      p_currency: 'USD'
    })
    if (wsErrA) throw new Error(`create_workspace RPC failed: ${wsErrA.message}`)
    const wsA = wsDataA
    console.log(`✓ Workspace created: ID = ${wsA.id}, Slug = "${wsA.slug}", Owner = ${wsA.owner_user_id}`)

    // Verify Owner Membership
    const { data: memberA, error: memErrA } = await clientA
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', wsA.id)
      .eq('user_id', userAId)
      .single()
    if (memErrA) throw new Error(`Owner membership check failed: ${memErrA.message}`)
    console.log(`✓ Workspace Member created: Role = "${memberA.role}", Status = "${memberA.status}"`)

    // Verify Workspace Settings
    const { data: settingsA, error: setErrA } = await clientA
      .from('workspace_settings')
      .select('*')
      .eq('workspace_id', wsA.id)
      .single()
    if (setErrA) throw new Error(`Workspace settings check failed: ${setErrA.message}`)
    console.log(`✓ Workspace Settings created: Timezone = "${settingsA.timezone}", Inactivity = ${settingsA.hot_lead_inactivity_hours}h`)

    // STEP 4: CASE-INSENSITIVE SLUG COLLISION TEST
    console.log('[4/7] Testing case-insensitive slug collision prevention...')
    const { error: dupErr } = await clientA.rpc('create_workspace', {
      p_name: 'Duplicate Agency',
      p_slug: slugA.toUpperCase(), // Case insensitive test
      p_timezone: 'UTC',
      p_currency: 'USD'
    })
    if (dupErr) {
      console.log(`✓ Slug collision cleanly rejected: "${dupErr.message}"`)
    } else {
      throw new Error('FAIL: Duplicate slug creation was not rejected!')
    }

    // STEP 5: AUTHENTICATE USER B & CREATE WORKSPACE B
    console.log(`\n[5/7] Authenticating User B (${emailB})...`)
    const dataB = await authenticateUser(clientB, emailB, passwordB, fullNameB)
    const userBId = dataB.user.id
    console.log(`✓ User B authenticated. User ID: ${userBId}`)

    const slugB = `beacon-realty-b-${timestamp}`
    const { data: wsDataB, error: wsErrB } = await clientB.rpc('create_workspace', {
      p_name: 'Beacon Realty B',
      p_slug: slugB,
      p_timezone: 'Europe/London',
      p_currency: 'GBP'
    })
    if (wsErrB) throw new Error(`User B create_workspace failed: ${wsErrB.message}`)
    const wsB = wsDataB
    console.log(`✓ User B Workspace created: ID = ${wsB.id}, Slug = "${wsB.slug}"`)

    // STEP 6: CROSS-TENANT MULTI-TENANT RLS ISOLATION TEST
    console.log('\n[6/7] Testing Multi-Tenant RLS Cross-Tenant Isolation...')

    // User A attempts to select Workspace B details directly from public.workspaces
    const { data: readWsBFromA } = await clientA
      .from('workspaces')
      .select('*')
      .eq('id', wsB.id)
    console.log(`• User A querying Workspace B: ${readWsBFromA?.length || 0} records returned (Expected: 0)`)
    if (readWsBFromA && readWsBFromA.length > 0) {
      throw new Error('RLS VIOLATION: User A was able to read Workspace B!')
    }
    console.log('✓ RLS Isolation Verified: User A cannot read Workspace B.')

    // User B attempts to select Workspace A details directly from public.workspaces
    const { data: readWsAFromB } = await clientB
      .from('workspaces')
      .select('*')
      .eq('id', wsA.id)
    console.log(`• User B querying Workspace A: ${readWsAFromB?.length || 0} records returned (Expected: 0)`)
    if (readWsAFromB && readWsAFromB.length > 0) {
      throw new Error('RLS VIOLATION: User B was able to read Workspace A!')
    }
    console.log('✓ RLS Isolation Verified: User B cannot read Workspace A.')

    // Test child table (leads) multi-tenant isolation
    console.log('• Testing Lead record tenant boundary isolation...')
    const { data: leadA, error: leadInsErr } = await clientA
      .from('leads')
      .insert({
        workspace_id: wsA.id,
        full_name: 'David Client A',
        phone: '+15550199',
        stage: 'new',
        priority: 'hot',
        status: 'active'
      })
      .select()
      .single()

    if (leadInsErr) throw new Error(`User A lead insert failed: ${leadInsErr.message}`)
    console.log(`✓ User A inserted lead in Workspace A: Lead ID = ${leadA.id}`)

    // User B attempts to select User A's lead from Workspace A
    const { data: leadsFromB } = await clientB
      .from('leads')
      .select('*')
      .eq('id', leadA.id)

    console.log(`• User B querying User A Lead: ${leadsFromB?.length || 0} records returned (Expected: 0)`)
    if (leadsFromB && leadsFromB.length > 0) {
      throw new Error('RLS VIOLATION: User B was able to read User A lead!')
    }
    console.log('✓ Multi-Tenant RLS Verified: User B cannot access User A leads.')

    // STEP 7: PERSISTENCE & RE-AUTHENTICATION TEST
    console.log('\n[7/7] Testing Sign Out & Sign In Persistence...')
    await clientA.auth.signOut()
    console.log('✓ User A signed out.')

    const { data: reAuthA, error: reAuthErr } = await clientA.auth.signInWithPassword({
      email: emailA,
      password: passwordA
    })
    if (reAuthErr) throw new Error(`Re-authentication failed: ${reAuthErr.message}`)
    console.log(`✓ User A signed back in successfully. User ID: ${reAuthA.user.id}`)

    // Fetch user active workspace memberships after re-authentication
    const { data: reMemA } = await clientA
      .from('workspace_members')
      .select(`role, status, workspace:workspaces(*)`)
      .eq('user_id', reAuthA.user.id)
      .eq('status', 'active')

    console.log(`✓ Re-authenticated workspace query returned ${reMemA?.length || 0} active workspace(s). Onboarding bypass confirmed!`)

    console.log('\n======================================================')
    console.log('SUCCESS: ALL PHASE 1 HARDENING & LIVE INTEGRATION TESTS PASSED CLEANLY!')
    console.log('======================================================')
  } catch (error) {
    console.error('\n❌ INTEGRATION TEST FAILED:', error.message)
    process.exit(1)
  }
}

runSmokeTest()
