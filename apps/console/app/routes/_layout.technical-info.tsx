import { useState, useEffect } from "react";
import { Form, useLoaderData, useActionData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/_layout.technical-info";
import { cn, RichTextEditor } from "@secretlobby/ui";
import { toast } from "sonner";

export function meta() {
  return [{ title: "Technical Info - Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getTechnicalInfoSettings } = await import("~/lib/content.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const technicalInfo = await getTechnicalInfoSettings(accountId);

  return { technicalInfo };
}

export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { updateTechnicalInfoSettings } = await import("~/lib/content.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:technical-info" });

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "update-technical-info": {
        const title = (formData.get("title") as string) || "";
        const content = (formData.get("content") as string) || "";

        await updateTechnicalInfoSettings(accountId, { title, content });
        return { success: "Technical information updated successfully" };
      }
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Technical info update error");
    return { error: "Operation failed" };
  }

  return null;
}

export default function TechnicalInfoPage() {
  const { technicalInfo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [title, setTitle] = useState(technicalInfo.title);
  const [content, setContent] = useState(technicalInfo.content);

  useEffect(() => {
    if (actionData?.success) {
      toast.success(actionData.success);
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  return (
    <div className="space-y-8">
      <Form method="post">
        <input type="hidden" name="intent" value="update-technical-info" />
        <input type="hidden" name="content" value={content} />

        <section className="bg-theme-secondary rounded-xl p-6 border border-theme mb-6">
          <h2 className="text-lg font-semibold mb-4">Technical Information</h2>
          <p className="text-sm text-theme-secondary mb-6">
            Add technical information about your band or project. This will be displayed as a card below the playlist in your lobby.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Card Title</label>
              <input
                type="text"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Technical Rider, Equipment List, Stage Plot"
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-(--color-accent)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Content</label>
              <RichTextEditor
                name="contentEditor"
                defaultValue={content}
                placeholder="Enter your technical information here..."
                features={["bold", "italic", "underline", "textAlign", "heading", "bulletList", "orderedList", "link", "blockquote", "htmlSource"]}
                onChange={(html) => setContent(html)}
              />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50",
            { "cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting }
          )}
        >
          {isSubmitting ? "Saving..." : "Save Technical Info"}
        </button>
      </Form>
    </div>
  );
}
