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

const ACCESS_RULES = {
  admin: ['materiales', 'catalogos', 'cotizador', 'data'],
  editor: ['materiales'],
};
const DEFAULT_ACCESS = [];

const ensureTopbarStyles = () => {
  if (document.getElementById('desktop-auth-bar-styles')) return;
  const style = document.createElement('style');
  style.id = 'desktop-auth-bar-styles';
  style.textContent = `
    .desktop-auth-bar { position: fixed; top: 0.65rem; right: 1.5rem; display: flex; justify-content: flex-end; align-items: center; padding: 0.25rem 0; z-index: 1600; }
    .desktop-auth-bar__right { display: flex; align-items: center; gap: 0.5rem; }
    .desktop-auth-bar .auth-user-button { pointer-events: auto; }
    @media (max-width: 768px) { .desktop-auth-bar { display: none; } }
  `;
  document.head.appendChild(style);
};

const markLegacyAnchors = () => {
  if (userButtonAnchor) {
    userButtonAnchor.dataset.clerkUserAnchor = 'true';
  }
  if (userButtonSlot) {
    userButtonSlot.dataset.clerkUserSlot = 'true';
  }
  if (rolePill) {
    rolePill.dataset.rolePill = 'true';
  }
};

const ensureDesktopTopbar = () => {
  ensureTopbarStyles();
  const existing = document.querySelector('.desktop-auth-bar');
  if (existing) return existing;
  const container = document.querySelector('.layout__content');
  if (!container) return null;

  const bar = document.createElement('div');
  bar.className = 'desktop-auth-bar';

  const right = document.createElement('div');
  right.className = 'desktop-auth-bar__right';

  const anchor = document.createElement('div');
  anchor.className = 'auth-user-button';
  anchor.hidden = true;
  anchor.dataset.clerkUserAnchor = 'true';

  const pill = document.createElement('span');
  pill.className = 'role-pill';
  pill.dataset.rolePill = 'true';
  pill.hidden = true;

  const slot = document.createElement('div');
  slot.dataset.clerkUserSlot = 'true';

  anchor.appendChild(pill);
  anchor.appendChild(slot);
  right.appendChild(anchor);
  bar.appendChild(right);
  container.insertBefore(bar, container.firstChild);
  return bar;
};

const getUserAnchors = () => {
  markLegacyAnchors();
  ensureDesktopTopbar();
  const anchors = Array.from(document.querySelectorAll('[data-clerk-user-anchor]'));
  if (!anchors.length) return [];

  const desktopAnchors = anchors.filter((a) => a.closest('.desktop-auth-bar'));
  const mobileAnchors = anchors.filter((a) => a.closest('.mobile-nav'));

  if (mobileAnchors.length) return mobileAnchors;
  if (desktopAnchors.length) return desktopAnchors;

  return anchors;
};

const getRolePills = () => {
  markLegacyAnchors();
  ensureDesktopTopbar();
  const pills = Array.from(document.querySelectorAll('[data-role-pill]'));
  if (!pills.length) return [];

  const desktopPills = pills.filter((p) => p.closest('.desktop-auth-bar'));
  const mobilePills = pills.filter((p) => p.closest('.mobile-nav'));

  if (mobilePills.length) return mobilePills;
  if (desktopPills.length) return desktopPills;

  return pills;
};

const resolveSlugFromUrl = (url) => {
  if (!url) return '';
  const path = (url instanceof URL ? url.pathname : url).toString();
  if (path.includes('/data')) return 'data';
  if (path.includes('/catalogo')) return 'catalogos';
  if (path.includes('/cotizador')) return 'cotizador';
  if (path.includes('/material')) return 'materiales';
  return '';
};

const resetNavVisibility = () => {
  const selectors = ['.sidebar__link', '.mobile-nav__drawer-link'];
  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((link) => {
      const wrapper = link.closest('li') || link;
      if (wrapper.dataset.originalDisplay !== undefined) {
        wrapper.style.display = wrapper.dataset.originalDisplay;
      } else {
        wrapper.style.display = '';
      }
      link.removeAttribute('aria-hidden');
      link.tabIndex = 0;
    });
  });
};

const applyRoleAccess = (role) => {
  const normalized = (role || '').toString().toLowerCase();
  const allowed = ACCESS_RULES[normalized] || DEFAULT_ACCESS;
  const selectors = ['.sidebar__link', '.mobile-nav__drawer-link'];

  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((link) => {
      const slug = link.dataset.tab || resolveSlugFromUrl(link.getAttribute('href') || '');
      const isAllowed = allowed.includes(slug);
      const wrapper = link.closest('li') || link;
      if (wrapper.dataset.originalDisplay === undefined) {
        wrapper.dataset.originalDisplay = wrapper.style.display || '';
      }
      if (!isAllowed) {
        wrapper.style.display = 'none';
        link.setAttribute('aria-hidden', 'true');
        link.tabIndex = -1;
      } else {
        wrapper.style.display = wrapper.dataset.originalDisplay;
        link.removeAttribute('aria-hidden');
        link.tabIndex = 0;
      }
    });
  });

  // If no allowed tabs, keep the overlay lock and avoid redirects
  if (!allowed.length) {
    return;
  }

  const currentSlug = resolveSlugFromUrl(window.location.pathname);
  if (currentSlug && !allowed.includes(currentSlug)) {
    const fallback = allowed.includes('materiales') ? '/materiales' : allowed[0] ? `/${allowed[0]}` : '/';
    if (fallback) {
      window.location.replace(fallback);
    }
  }
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
  const role = (user?.publicMetadata?.role ?? '').toString();
  const roleLabel = role.trim() ? role : 'sin rol';
  if (overlayRoleMeta) {
    overlayRoleMeta.hidden = false;
    overlayRoleMeta.textContent = `Rol detectado: ${roleLabel}`;
  }
  getRolePills().forEach((pill) => {
    pill.hidden = false;
    pill.textContent = `Rol: ${roleLabel}`;
  });
  applyRoleAccess(role);
};

const mountUserButton = (clerk) => {
  const anchors = getUserAnchors();
  if (!anchors.length) return;

  anchors.forEach((anchor) => {
    const slot = anchor.querySelector('[data-clerk-user-slot]') || anchor;
    anchor.hidden = false;
    if (slot) {
      slot.innerHTML = '';
      clerk.mountUserButton(slot, {
        afterSignOutUrl: window.location.origin + window.location.pathname,
      });
    }
  });
  state.userButtonMounted = true;
};

const unmountUserButton = () => {
  getUserAnchors().forEach((anchor) => {
    const slot = anchor.querySelector('[data-clerk-user-slot]') || anchor;
    if (slot) {
      slot.innerHTML = '';
    }
    anchor.hidden = true;
  });
  state.userButtonMounted = false;
  getRolePills().forEach((pill) => {
    pill.hidden = true;
    pill.textContent = '';
  });
  if (overlayRoleMeta) {
    overlayRoleMeta.hidden = true;
    overlayRoleMeta.textContent = '';
  }
  resetNavVisibility();
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
  const rawRole = (user?.publicMetadata?.role || '').toString();
  const normalizedRole = rawRole.trim().toLowerCase();
  const hasRole = Boolean(normalizedRole) && Boolean(ACCESS_RULES[normalizedRole]);

  updateRoleBadges(user);
  if (!hasRole) {
    setOverlayMessage(
      'Rol requerido',
      'Tu cuenta no tiene un rol asignado. Solicita al administrador que configure tu rol (admin/editor).'
    );
    setLocked(true);
  } else {
    setLocked(false);
  }

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
    ensureDesktopTopbar();
    markLegacyAnchors();
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
