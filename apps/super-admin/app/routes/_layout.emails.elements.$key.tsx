import { useLoaderData, Form, useActionData, useNavigation, Link } from "react-router";
import type { Route } from "./+types/_layout.emails.elements.$key";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Edit element: ${params.key} - Super Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { prisma } = await import("@secretlobby/db");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const key = params.key;
  if (!key) throw new Response("Not found", { status: 404 });

  const [element, defaults] = await Promise.all([
    prisma.emailHtmlElement.findUnique({ where: { key } }),
    import("@secretlobby/email").then((m) => ({
      DEFAULT_EMAIL_HEADER_HTML: m.DEFAULT_EMAIL_HEADER_HTML,
      DEFAULT_EMAIL_FOOTER_HTML: m.DEFAULT_EMAIL_FOOTER_HTML,
    })),
  ]);

  if (!element) throw new Response("Element not found", { status: 404 });

  const defaultForKey =
    key === "header"
      ? { name: "Email Header", html: defaults.DEFAULT_EMAIL_HEADER_HTML }
      : key === "footer"
        ? { name: "Email Footer", html: defaults.DEFAULT_EMAIL_FOOTER_HTML }
        : null;

  return { element, defaultContent: defaultForKey };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { prisma } = await import("@secretlobby/db");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const key = params.key;
  if (!key) return { error: "Missing key" };

  const formData = await request.formData();
  const name = formData.get("name") as string;
  const html = formData.get("html") as string;

  if (!name?.trim()) return { error: "Name is required" };
  if (html == null) return { error: "HTML is required" };

  await prisma.emailHtmlElement.update({
    where: { key },
    data: { name: name.trim(), html },
  });

  return { success: true };
}

export default function EditElementPage() {
  const { element, defaultContent } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [name, setName] = useState(element.name);
  const [html, setHtml] = useState(element.html);

  useEffect(() => {
    if (actionData?.success) toast.success("Element saved");
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData]);

  useEffect(() => {
    setName(element.name);
    setHtml(element.html);
  }, [element.name, element.html]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link to="/emails" className="text-gray-400 hover:text-white transition">
          ← Back to Emails
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold">Edit element: {element.name}</h2>
        <p className="text-gray-400 text-sm mt-1">
          Key: <code className="bg-gray-800 px-2 py-0.5 rounded">{element.key}</code>. This block is reused in all notification emails. Use table-based HTML with inline styles only. You can use {"{{year}}"} for the current year.
        </p>
      </div>

      <Form method="post" className="space-y-6">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <label className="block text-sm font-medium text-gray-400 mb-2">Display name</label>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <label className="block text-sm font-medium text-gray-400 mb-2">HTML (inline styles only)</label>
          <p className="text-xs text-gray-500 mb-2">
            Use tables and inline styles for compatibility with all email clients. This content is inserted into every notification email.
          </p>
          <textarea
            name="html"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={20}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save element"}
          </button>
          {defaultContent && (
            <button
              type="button"
              onClick={() => {
                setName(defaultContent.name);
                setHtml(defaultContent.html);
                toast.success("Reverted to default. Click Save to persist.");
              }}
              className="px-6 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition"
            >
              Revert to default
            </button>
          )}
          <Link to="/emails" className="px-6 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition">
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
