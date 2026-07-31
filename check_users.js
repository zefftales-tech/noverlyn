import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hbydcxruvsczaudxjqim.supabase.co'
const supabaseAnonKey = 'sb_publishable_F6cng6kh8OLLVjtZnkSDIA_NcR83IgD'

const client = createClient(supabaseUrl, supabaseAnonKey)

async function testSingleSignUp() {
  console.log('Testing single SignUp...')
  const res = await client.auth.signUp({
    email: 'test.noverlyn.user1@gmail.com',
    password: 'TestPass123!@#',
    options: {
      data: { full_name: 'Test User 1' }
    }
  })
  console.log('Result:', res)
}

testSingleSignUp()
