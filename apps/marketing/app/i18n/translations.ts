export type Locale = "en" | "es";

export interface TranslationKeys {
  meta: {
    title: string;
    description: string;
  };
  nav: {
    features: string;
    howItWorks: string;
    pricing: string;
    faq: string;
    signIn: string;
    getStarted: string;
  };
  hero: {
    headline1: string;
    headline2: string;
    headline3: string;
    subtitle: string;
    cta: string;
    demo: string;
    stat1Value: string;
    stat1Label: string;
    stat2Value: string;
    stat2Label: string;
    stat3Value: string;
    stat3Label: string;
  };
  features: {
    title: string;
    titleHighlight: string;
    subtitle: string;
    items: Array<{
      title: string;
      description: string;
    }>;
  };
  howItWorks: {
    title: string;
    titleHighlight: string;
    titleEnd: string;
    subtitle: string;
    steps: Array<{
      title: string;
      description: string;
    }>;
  };
  cta: {
    title: string;
    titleHighlight: string;
    subtitle: string;
    button: string;
    sales: string;
    freeNote: string;
    benefit1: string;
    benefit2: string;
    benefit3: string;
  };
  footer: {
    tagline: string;
    product: string;
    features: string;
    pricing: string;
    security: string;
    roadmap: string;
    company: string;
    about: string;
    blog: string;
    contact: string;
    terms: string;
    newsletter: string;
    newsletterText: string;
    copyright: string;
    privacy: string;
    cookies: string;
  };
  modal: {
    title: string;
    subtitle: string;
    placeholder: string;
    button: string;
    submitting: string;
    privacy: string;
    success: string;
    alreadyRegistered: string;
  };
  errors: {
    tooManyRequests: string;
    emailRequired: string;
    invalidEmail: string;
    somethingWrong: string;
  };
}

export const translations: Record<Locale, TranslationKeys> = {
  en: {
    meta: {
      title: "SecretLobby - Private Music Sharing for Artists",
      description: "Share your unreleased music privately with record labels. Password-protected access to protect your work.",
    },
    nav: {
      features: "Features",
      howItWorks: "How It Works",
      pricing: "Pricing",
      faq: "FAQ",
      signIn: "Sign In",
      getStarted: "Request Early Access",
    },
    hero: {
      headline1: "Your Music.",
      headline2: "Your Lobby.",
      headline3: "Your Control.",
      subtitle: "Create private and secure lobbies to share your music with record labels. Password-protected access to protect your work.",
      cta: "Request Early Access",
      demo: "Watch Demo"
    },
    features: {
      title: "Everything you need to",
      titleHighlight: "share your music",
      subtitle: "Secret Lobby gives you full control over who accesses your musical content",
      items: [
        {
          title: "Private Lobbies",
          description: "Create secure spaces with controlled access. Only those with the password can enter.",
        },
        {
          title: "Password Access",
          description: "Share your lobbies with custom passwords. You decide who listens to your music.",
        },
        {
          title: "Protected Music",
          description: "Upload and share your tracks securely. Your work is protected at all times.",
        },
        {
          title: "For Record Labels",
          description: "Designed to connect artists with record labels professionally and securely.",
        },
        {
          title: "Maximum Security",
          description: "Enterprise-grade encryption to protect your valuable musical content.",
        },
        {
          title: "Fast & Simple",
          description: "Create a lobby in seconds. Intuitive interface designed for artists.",
        },
      ],
    },
    howItWorks: {
      title: "How",
      titleHighlight: "Secret Lobby",
      titleEnd: "works",
      subtitle: "In four simple steps, connect with record labels professionally",
      steps: [
        {
          title: "Upload Your Music",
          description: "Upload your tracks in high-quality format. We support MP3, WAV, FLAC and more.",
        },
        {
          title: "Create a Lobby",
          description: "Generate a private lobby with a custom password. Ready in seconds.",
        },
        {
          title: "Share the Password",
          description: "Send the link and password only to the record labels you want to hear your music.",
        },
        {
          title: "They Listen",
          description: "Labels access your private music securely and professionally.",
        },
      ],
    },
    cta: {
      title: "Be among the first to",
      titleHighlight: "share your music securely",
      subtitle: "We're launching soon. Request early access and be the first to experience Secret Lobby.",
      button: "Request Early Access",
      sales: "Talk to Sales",
      freeNote: "Limited spots available for early adopters",
      benefit1: "Exclusive early access",
      benefit2: "Shape the product",
      benefit3: "Free during beta",
    },
    footer: {
      tagline: "The leading platform for sharing private music securely with record labels.",
      product: "Product",
      features: "Features",
      pricing: "Pricing",
      security: "Security",
      roadmap: "Roadmap",
      company: "Company",
      about: "About Us",
      blog: "Blog",
      contact: "Contact",
      terms: "Terms",
      newsletter: "Newsletter",
      newsletterText: "Get updates and tips for artists.",
      copyright: "© 2026 Secret Lobby. All rights reserved.",
      privacy: "Privacy",
      cookies: "Cookies",
    },
    modal: {
      title: "Join the Waitlist",
      subtitle: "We're launching soon. Leave your email to stay updated on our progress.",
      placeholder: "you@email.com",
      button: "Join Waitlist",
      submitting: "Sending...",
      privacy: "We don't share your email with third parties.",
      success: "Thanks for your interest! We'll keep you updated on our launch.",
      alreadyRegistered: "You're already on our list! We'll keep you posted.",
    },
    errors: {
      tooManyRequests: "Too many requests. Please try again later.",
      emailRequired: "Email is required",
      invalidEmail: "Please enter a valid email address",
      somethingWrong: "Something went wrong. Please try again.",
    },
  },
  es: {
    meta: {
      title: "SecretLobby - Comparte tu Música de Forma Privada",
      description: "Comparte tu música inédita de forma privada con record labels. Acceso protegido por contraseña para proteger tu trabajo.",
    },
    nav: {
      features: "Características",
      howItWorks: "Cómo Funciona",
      pricing: "Precios",
      faq: "FAQ",
      signIn: "Iniciar Sesión",
      getStarted: "Solicitar Acceso",
    },
    hero: {
      headline1: "Tu Música.",
      headline2: "Tu Lobby.",
      headline3: "Tu Control.",
      subtitle: "Crea lobbys privados y seguros para compartir tu música con record labels. Acceso controlado por clave para proteger tu trabajo.",
      cta: "Solicitar Acceso",
      demo: "Ver Demo",
      stat1Value: "100%",
      stat1Label: "Privado y Seguro",
      stat2Value: "24/7",
      stat2Label: "Acceso Disponible",
      stat3Value: "∞",
      stat3Label: "Lobbys Ilimitados",
    },
    features: {
      title: "Todo lo que necesitas para",
      titleHighlight: "compartir tu música",
      subtitle: "Secret Lobby te da el control total sobre quién accede a tu contenido musical",
      items: [
        {
          title: "Lobbys Privados",
          description: "Crea espacios seguros con acceso controlado. Solo quienes tengan la clave pueden entrar.",
        },
        {
          title: "Acceso con Clave",
          description: "Comparte tus lobbys con claves personalizadas. Tú decides quién escucha tu música.",
        },
        {
          title: "Música Protegida",
          description: "Sube y comparte tus tracks de forma segura. Tu trabajo está protegido en todo momento.",
        },
        {
          title: "Para Record Labels",
          description: "Diseñado para conectar artistas con record labels de manera profesional y segura.",
        },
        {
          title: "Máxima Seguridad",
          description: "Encriptación de nivel empresarial para proteger tu contenido musical valioso.",
        },
        {
          title: "Rápido y Simple",
          description: "Crea un lobby en segundos. Interface intuitiva diseñada para artistas.",
        },
      ],
    },
    howItWorks: {
      title: "Cómo funciona",
      titleHighlight: "Secret Lobby",
      titleEnd: "",
      subtitle: "En cuatro pasos simples, conecta con record labels de manera profesional",
      steps: [
        {
          title: "Sube tu Música",
          description: "Carga tus tracks en formato de alta calidad. Soportamos MP3, WAV, FLAC y más.",
        },
        {
          title: "Crea un Lobby",
          description: "Genera un lobby privado con una clave personalizada. En segundos estás listo.",
        },
        {
          title: "Comparte la Clave",
          description: "Envía el link y la clave solo a los record labels que quieres que escuchen.",
        },
        {
          title: "Ellos Escuchan",
          description: "Los labels acceden de forma segura y profesional a tu música privada.",
        },
      ],
    },
    cta: {
      title: "Sé de los primeros en",
      titleHighlight: "compartir tu música de forma segura",
      subtitle: "Estamos por lanzar. Solicita acceso anticipado y sé el primero en experimentar Secret Lobby.",
      button: "Solicitar Acceso Anticipado",
      sales: "Hablar con Ventas",
      freeNote: "Plazas limitadas para early adopters",
      benefit1: "Acceso exclusivo anticipado",
      benefit2: "Ayuda a dar forma al producto",
      benefit3: "Gratis durante la beta",
    },
    footer: {
      tagline: "La plataforma líder para compartir música privada de manera segura con record labels.",
      product: "Producto",
      features: "Características",
      pricing: "Precios",
      security: "Seguridad",
      roadmap: "Roadmap",
      company: "Compañía",
      about: "Sobre Nosotros",
      blog: "Blog",
      contact: "Contacto",
      terms: "Términos",
      newsletter: "Newsletter",
      newsletterText: "Recibe novedades y consejos para artistas.",
      copyright: "© 2026 Secret Lobby. Todos los derechos reservados.",
      privacy: "Privacidad",
      cookies: "Cookies",
    },
    modal: {
      title: "Únete a la Lista de Espera",
      subtitle: "Estamos por lanzar. Deja tu email para mantenerte informado sobre nuestro progreso.",
      placeholder: "tu@email.com",
      button: "Unirme a la Lista",
      submitting: "Enviando...",
      privacy: "No compartimos tu email con terceros.",
      success: "¡Gracias por tu interés! Te mantendremos informado sobre nuestro lanzamiento.",
      alreadyRegistered: "¡Ya estás en nuestra lista! Te mantendremos al tanto.",
    },
    errors: {
      tooManyRequests: "Demasiadas solicitudes. Por favor intenta más tarde.",
      emailRequired: "El email es requerido",
      invalidEmail: "Por favor ingresa un email válido",
      somethingWrong: "Algo salió mal. Por favor intenta de nuevo.",
    },
  },
};

export const defaultLocale: Locale = "en";
export const locales: Locale[] = ["en", "es"];

export function getTranslations(locale: Locale): TranslationKeys {
  return translations[locale] || translations[defaultLocale];
}

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
