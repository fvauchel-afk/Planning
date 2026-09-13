import "server-only";

const PROJECT_VAPID_PUBLIC =
  "BIQ8HsSpjG0Cq42JK_i7wSZvTxhMjqLR-zSEjsx51jsNLZdElBf7VcAjDD5MGoGiUzxDKUGyfuxdNQ4NU6hX4WQ";
const PROJECT_VAPID_PRIVATE = "dkdUDLdNA_itb0aMS4jxSHPmtfN_JVYXd490zb1rjjI";

export function vapidPublicKey(): string {
  return (
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    PROJECT_VAPID_PUBLIC
  );
}

export function vapidPrivateKey(): string {
  return process.env.VAPID_PRIVATE_KEY?.trim() || PROJECT_VAPID_PRIVATE;
}

export function vapidSubject(): string {
  return (
    process.env.VAPID_SUBJECT?.trim() || "mailto:f.vauchel@hotmail.com"
  );
}

export function vapidConfigured(): boolean {
  return Boolean(vapidPublicKey() && vapidPrivateKey());
}
