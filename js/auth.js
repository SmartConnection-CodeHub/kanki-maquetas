/* KANKI QAS — auth compartido (adaptado de kanki-street/js/auth.js)
   Requiere js/supabase.umd.js + js/supabase-init.js cargados antes. */
var currentUser = null

async function initAuth() {
  if (!supabase) return
  const { data: { session } } = await supabase.auth.getSession()
  currentUser = session?.user ?? null

  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user ?? null
    updateAuthUI()
    document.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: currentUser } }))
  })

  updateAuthUI()
  document.dispatchEvent(new CustomEvent('auth-ready', { detail: { user: currentUser } }))
}

async function getAccessToken() {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function loginWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

async function registerWithEmail(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })
  if (error) throw error
  return data
}

async function loginWithGoogle(redirectTo) {
  /* redirectTo explícito: el proyecto Supabase es compartido con la intranet,
     sin esto el callback caería en la Site URL de la intranet */
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectTo || (window.location.origin + window.location.pathname) },
  })
  if (error) throw error
}

async function logout() {
  await supabase.auth.signOut()
  currentUser = null
  window.location.reload()
}

function updateAuthUI() {
  document.querySelectorAll('[data-auth="login-btn"]').forEach(el => el.style.display = currentUser ? 'none' : '')
  document.querySelectorAll('[data-auth="user-menu"]').forEach(el => el.style.display = currentUser ? '' : 'none')
  document.querySelectorAll('[data-auth="user-name"]').forEach(el => {
    if (currentUser) el.textContent = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Usuario'
  })
}
