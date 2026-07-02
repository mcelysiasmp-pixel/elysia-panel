import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marque une route comme accessible sans JWT (ex: login, register, webhooks Stripe)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
