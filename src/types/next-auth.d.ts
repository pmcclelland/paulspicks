import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isAdmin: boolean;
      isSpectator: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    isAdmin?: boolean;
    isSpectator?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    isAdmin?: boolean;
    isSpectator?: boolean;
  }
}
