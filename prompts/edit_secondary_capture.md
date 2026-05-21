## Where you are

You are in a Curate Mind Secondary Capture edit. This conversation changes what the second source-processing stage captures in future source extractions.

## What happens here

You will read the current project profile, help me choose whether Secondary Capture is off, set to the default Mental Models capture, or set to a custom free-text capture description, then save the change through the Model Context Protocol tools and preview the assembled prompt.

## What comes next

After this edit is saved, only future source extractions use the new Secondary Capture configuration. Existing captured mental models and existing secondary captured items are preserved.

# Curate Mind Secondary Capture Edit Prompt

You are helping me change what Curate Mind captures in the second source-processing stage. Spell everything out clearly. Do not use shorthand. Do not use acronyms unless they are part of an exact tool name, file path, or product name that must remain exact.

Use the Model Context Protocol tools in this exact order:

1. Call `cm_get_project_profile`.
2. Call `cm_update_project_profile`.
3. Call `cm_preview_prompt_profile`.

First, call `cm_get_project_profile` and show me the current Secondary Capture configuration in plain language. Include whether Secondary Capture is enabled, the current capture label, and the current capture description.

Explain this before asking for my choice:

Secondary Capture is the optional second reading of each source. Curate Mind first extracts atomic claims. Then, if Secondary Capture is enabled, it reads the source again with a fresh context window to capture a second kind of reusable item. The default is Mental Models, which means frameworks, analogies, named ideas, and memorable terms. You can turn this stage off, keep the Mental Models default, or define a custom capture description.

Also explain this preservation rule:

Changing this setting does not delete, rewrite, or overwrite anything already captured. Existing mental models and existing secondary captured items stay as they are. The new configuration only affects future source extractions.

Offer these three options:

1. Turn Secondary Capture off.
   This is fastest and simplest when atomic claims are enough.

2. Use the default Mental Models capture.
   This is best when the project benefits from frameworks, analogies, named concepts, and reusable language.

3. Use a custom capture description.
   This is best when the project needs a different second item, such as decision points, methodology limitations, product names, stakeholder objections, regulatory requirements, budget figures, or strategic risks.

If I choose a custom capture description, help me write it. A good capture description should say:

- What to capture.
- What not to capture.
- What details each captured item should include.
- When the assistant should flag an item for curator review.
- How the captured item should be titled.

When I choose the new configuration, call `cm_update_project_profile` with:

- `secondaryCaptureEnabled`.
- `secondaryCaptureLabel`.
- `secondaryCaptureDescription`.

Then call `cm_preview_prompt_profile`. Show me the updated assembled prompt in a compact way. Explain how future source-processing conversations will behave differently.

End with this handoff:

The Secondary Capture configuration is saved. Existing captured items were preserved. Future source extractions will use the new Secondary Capture setting.
