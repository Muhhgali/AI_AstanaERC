import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  loadResidentRequestSettings,
  normalizeResidentRequestSettings,
  saveResidentRequestSettings,
} from "@/lib/residentRequests";

const SETUP_MESSAGE =
  "Таблица настроек ещё не создана. Выполни supabase/migrations/20261029000000_app_settings.sql в Supabase SQL Editor.";

export async function GET(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const { settings, setupRequired } = await loadResidentRequestSettings({ fresh: true });

  return Response.json({
    residentRequests: settings,
    setupRequired,
    message: setupRequired ? SETUP_MESSAGE : undefined,
  });
}

export async function PUT(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const body = (await req.json().catch(() => ({}))) as { residentRequests?: unknown };

  if (!body.residentRequests || typeof body.residentRequests !== "object") {
    return Response.json({ message: "residentRequests is required" }, { status: 400 });
  }

  const settings = normalizeResidentRequestSettings(body.residentRequests);
  const result = await saveResidentRequestSettings(settings, authorization.user.id);

  if (!result.ok) {
    return Response.json(
      {
        message: result.setupRequired ? SETUP_MESSAGE : result.message,
        setupRequired: result.setupRequired,
      },
      { status: result.setupRequired ? 409 : 500 }
    );
  }

  return Response.json({ residentRequests: settings });
}
