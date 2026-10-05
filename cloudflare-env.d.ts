declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    DEPARTMENT_SETUP_TOKEN?: string;
  }
}
