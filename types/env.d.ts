declare module '@env' {

  // AWS Configuration
  export const AWS_REGION: string;
  export const AWS_ACCESS_KEY_ID: string;
  export const AWS_SECRET_ACCESS_KEY: string;

  // Supabase Configuration
  export const SUPABASE_URL: string;
  export const SUPABASE_ANON_KEY: string;

  // Cloudinary Configuration
  export const CLOUDINARY_CLOUD_NAME: string;
  export const CLOUDINARY_API_KEY: string;
  export const CLOUDINARY_API_SECRET: string;
  export const CLOUDINARY_UPLOAD_PRESET: string;
} 