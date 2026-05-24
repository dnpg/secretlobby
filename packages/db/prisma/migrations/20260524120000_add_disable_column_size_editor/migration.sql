-- Add SystemSettings.disableColumnSizeEditor — global flag that hides the
-- page-builder's per-section grid-template-columns inputs from customers.
-- Defaults to TRUE so the controls are immediately gated on rollout;
-- super-admin can flip it off from /settings to expose them again.

ALTER TABLE "SystemSettings"
    ADD COLUMN "disableColumnSizeEditor" BOOLEAN NOT NULL DEFAULT true;
