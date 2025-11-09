import './style.css'
import { Clerk } from '@clerk/clerk-js'

const appContainer = document.querySelector('#app')

if (!appContainer) {
  throw new Error('No se encontró el contenedor #app en el DOM')
}

const renderError = (message) => {
  appContainer.innerHTML = `
    <section class="state state--error">
      <h1>Error</h1>
      <p>${message}</p>
      <small>Revisa tu configuración de Clerk e inténtalo de nuevo.</small>
    </section>
  `
}

const renderLoading = () => {
  appContainer.innerHTML = `
    <section class="state state--loading">
      <span class="spinner" aria-hidden="true"></span>
      <p>Preparando el acceso seguro…</p>
    </section>
  `
}

const renderSignIn = (clerk) => {
  appContainer.innerHTML = `
    <section class="auth-wrapper">
      <div class="auth-copy">
        <p class="eyebrow">Cojines Confort</p>
        <h1>Inicia sesión para continuar</h1>
        <p class="helper">
          Protegemos todo el contenido. Debes autenticarte antes de acceder al
          cotizador o a los catálogos.
        </p>
      </div>
      <div id="sign-in-component"></div>
    </section>
  `

  clerk.mountSignIn(document.getElementById('sign-in-component'), {
    appearance: {
      elements: {
        rootBox: { width: '100%' },
      },
    },
    afterSignInUrl: window.location.origin,
    signInFallbackRedirectUrl: window.location.origin,
  })
}

const renderDashboard = (clerk, user) => {
  const role = (user?.publicMetadata?.role ?? 'visitante').toString()
  const displayName =
    user?.fullName ??
    user?.firstName ??
    user?.username ??
    user?.primaryEmailAddress?.emailAddress ??
    'Usuario'

  appContainer.innerHTML = `
    <section class="dashboard">
      <header class="dashboard__header">
        <div class="dashboard__welcome">
          <p class="eyebrow">Acceso concedido</p>
          <h1>${displayName}</h1>
          <p class="role-pill" data-role="${role}">Rol: ${role}</p>
        </div>
        <div id="user-button"></div>
      </header>
      <article class="dashboard__body">
        <p>
          Ya puedes navegar por la aplicación. Todo el contenido queda detrás
          de Clerk, por lo que los usuarios no autenticados no pueden acceder.
        </p>
        <ul>
          <li>Este usuario tiene el rol configurado en la metadata pública.</li>
          <li>
            Actualiza el rol desde el Dashboard de Clerk y vuelve a iniciar
            sesión para reflejar los cambios.
          </li>
        </ul>
      </article>
    </section>
  `

  clerk.mountUserButton(document.getElementById('user-button'), {
    afterSignOutUrl: window.location.origin,
  })
}

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!publishableKey) {
  renderError(
    'No encontramos la variable VITE_CLERK_PUBLISHABLE_KEY. Añádela a tu archivo .env.'
  )
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')
}

const clerk = new Clerk(publishableKey)
renderLoading()

try {
  await clerk.load()
  const user = clerk.user

  if (user) {
    renderDashboard(clerk, user)
  } else {
    renderSignIn(clerk)
  }
} catch (error) {
  console.error(error)
  renderError('No se pudo inicializar Clerk. Revisa la consola para más detalles.')
}
