import { NextResponse, type NextRequest } from "next/server";
import { logout } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await logout();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
