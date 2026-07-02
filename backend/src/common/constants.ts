// UUID fixe du compte système utilisé pour les actions déclenchées par des
// processus internes (scheduler de tâches planifiées, jobs de facturation
// automatiques, ...). Créé par `prisma/seed.ts`, jamais utilisable pour se
// connecter (passwordHash = null).
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
