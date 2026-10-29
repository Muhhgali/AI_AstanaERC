import { getResidentRequestSettings } from "@/lib/residentRequests";

// Public: the chat page reads which request forms to show. Only on/off flags.
export async function GET() {
  const residentRequests = await getResidentRequestSettings();

  return Response.json(
    { residentRequests },
    { headers: { "Cache-Control": "no-store" } }
  );
}
