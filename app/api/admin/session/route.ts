import {
  clearSessionCookie,
  createAdminSession,
  credentialsMatch,
  isAdminRequest,
  isSameOrigin,
  sessionCookie,
} from "../../../admin-auth";

export async function GET(request: Request) {
  return Response.json(
    { authenticated: await isAdminRequest(request) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid login request." }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as { username?: string; password?: string };
    const username = payload.username?.trim() ?? "";
    const password = payload.password ?? "";

    if (!(await credentialsMatch(username, password))) {
      return Response.json({ error: "Incorrect username or password." }, { status: 401 });
    }

    return Response.json(
      { authenticated: true },
      { headers: { "Set-Cookie": sessionCookie(await createAdminSession()), "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not sign in." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid sign-out request." }, { status: 403 });
  }
  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } }
  );
}
