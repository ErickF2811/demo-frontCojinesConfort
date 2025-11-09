const clerkPublishableKey = (window.CLERK_PUBLISHABLE_KEY || '').trim();

const overlay = document.getElementById('auth-overlay');
const signInContainer = document.getElementById('clerk-sign-in');
const overlayRoleMeta = document.getElementById('auth-role-meta');
const userButtonAnchor = document.getElementById('clerk-user-button-anchor');
const rolePill = document.getElementById('auth-role-pill');
const userButtonSlot = document.getElementById('clerk-user-button-slot');
const clerkScript = document.getElementById('clerk-browser');

const state = {
  clerk: null,
  userButtonMounted: false,
  signInMounted: false,
};

const loadClerkInstance = () =>
  new Promise((resolve, reject) => {
    const startLoading = () => {
      if (!window.Clerk || typeof window.Clerk.load !== 'function') {
        reject(new Error('Clerk no se inicializó correctamente.'));
        return;
      }
      window.Clerk
        .load({ publishableKey: clerkPublishableKey })
        .then(() => resolve(window.Clerk))
        .catch(reject);
    };

    if (window.Clerk?.load) {
      startLoading();
      return;
    }

    if (!clerkScript) {
      reject(new Error('El script de Clerk no se incluyó en la página.'));
      return;
    }

    clerkScript.addEventListener('load', startLoading, { once: true });
    clerkScript.addEventListener(
      'error',
      () => reject(new Error('No se pudo descargar Clerk desde la CDN.')),
      { once: true }
    );
  });

const setLocked = (locked) => {
  if (!overlay) {
    return;
  }
  document.body.classList.toggle('auth-locked', locked);
  overlay.hidden = !locked;
};

const setOverlayMessage = (title, message) => {
  if (!overlay) {
    return;
  }
  const heading = overlay.querySelector('h1');
  const helper = overlay.querySelector('.helper');
  if (heading && title) {
    heading.textContent = title;
  }
  if (helper && message) {
    helper.textContent = message;
  }
};

const updateRoleBadges = (user) => {
  const role = (user?.publicMetadata?.role ?? 'sin rol').toString();
  if (overlayRoleMeta) {
    overlayRoleMeta.hidden = false;
    overlayRoleMeta.textContent = `Rol detectado: ${role}`;
  }
  if (rolePill) {
    rolePill.hidden = false;
    rolePill.textContent = `Rol: ${role}`;
  }
};

const mountUserButton = (clerk) => {
  if (!userButtonAnchor || !userButtonSlot) {
    return;
  }

  userButtonAnchor.hidden = false;
  userButtonSlot.innerHTML = '';
  clerk.mountUserButton(userButtonSlot, {
    afterSignOutUrl: window.location.origin + window.location.pathname,
  });
  state.userButtonMounted = true;
};

const unmountUserButton = () => {
  if (!userButtonSlot) {
    return;
  }
  userButtonSlot.innerHTML = '';
  state.userButtonMounted = false;
  if (rolePill) {
    rolePill.hidden = true;
    rolePill.textContent = '';
  }
  if (overlayRoleMeta) {
    overlayRoleMeta.hidden = true;
    overlayRoleMeta.textContent = '';
  }
};

const mountSignIn = (clerk) => {
  if (!signInContainer || state.signInMounted) {
    return;
  }

  const redirectTarget = window.location.origin + window.location.pathname;
  clerk.mountSignIn(signInContainer, {
    appearance: {
      elements: {
        rootBox: { width: '100%' },
      },
    },
    routing: 'virtual',
    fallbackRedirectUrl: redirectTarget,
    forceRedirectUrl: redirectTarget,
  });
  state.signInMounted = true;
};

const handleSignedIn = (clerk, user) => {
  setLocked(false);
  updateRoleBadges(user);
  if (!state.userButtonMounted) {
    mountUserButton(clerk);
  }
};

const handleSignedOut = (clerk) => {
  setLocked(true);
  if (state.userButtonMounted) {
    unmountUserButton();
  }
  mountSignIn(clerk);
};

const bootstrapClerk = async () => {
  if (!clerkPublishableKey) {
    setOverlayMessage(
      'Configura Clerk',
      'Falta la variable de entorno VITE_CLERK_PUBLISHABLE_KEY/CLERK_PUBLISHABLE_KEY.'
    );
    if (overlay) {
      overlay.hidden = false;
    }
    console.warn('[auth] Missing Clerk publishable key.');
    return;
  }

  try {
    setLocked(true);
    const clerk = await loadClerkInstance();
    state.clerk = clerk;

    if (clerk.user) {
      handleSignedIn(clerk, clerk.user);
    } else {
      handleSignedOut(clerk);
    }

    clerk.addListener(({ user }) => {
      if (user) {
        handleSignedIn(clerk, user);
      } else {
        handleSignedOut(clerk);
      }
    });
  } catch (error) {
    console.error('[auth] Clerk failed to load', error);
    setOverlayMessage(
      'Error al cargar Clerk',
      'No pudimos inicializar la autenticacion. Revisa la consola del navegador para mas detalles.'
    );
    if (overlay) {
      overlay.hidden = false;
    }
  }
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  bootstrapClerk();
} else {
  document.addEventListener('DOMContentLoaded', bootstrapClerk);
}
