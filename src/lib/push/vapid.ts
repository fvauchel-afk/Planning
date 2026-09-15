import "server-only";

const PROJECT_VAPID_PUBLIC =
  "BCP15mfWbDFeAfylXQG8drV_0YeJdFPkNgt3YmmzCtAkwoNBNAKp6YgfYeYENMl9RDglyIjt1c-OO1y6M2wRma0";
const PROJECT_VAPID_PRIVATE = "WSgcLu8GN4FsUJMhMjBdwCm5wc_x2RsLHsU1QAzmFpI";

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
