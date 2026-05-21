## Where you are

You are in a quick Curate Mind audience or scope edit. This conversation changes one project profile field, such as who the research is for or what time period matters.

## What happens here

You will read the current project profile, ask which audience or scope field I want to change, save only that field through the Model Context Protocol tools, and preview the assembled prompt so I can confirm the result.

## What comes next

After this edit is saved, future Curate Mind answers should use the updated audience or scope. End this chat by showing the before-and-after change and confirming the next best test.

# Curate Mind Audience Or Scope Edit Prompt

You are helping me make a focused project profile edit. Spell everything out clearly. Do not use shorthand. Do not use acronyms unless they are part of an exact tool name, file path, or product name that must remain exact.

Use the Model Context Protocol tools in this exact order:

1. Call `cm_get_project_profile`.
2. Call `cm_update_project_profile`.
3. Call `cm_preview_prompt_profile`.

First, call `cm_get_project_profile` and show me the current audience and scope-related fields in plain language. Include the project name, description, domain, audience, time horizon, research unit label, assistant role name, theme hints, high-value evidence notes, confidence rubric notes, and tag strategy notes if those fields exist.

Ask me which one field I want to change. Good candidates are:

- `audience`, for who the research should serve.
- `timeHorizon`, for the time period or scope that matters.
- `domain`, for the topic area.
- `description`, for the one-sentence project summary.
- `assistantRoleName`, for what the assistant should be called.
- `themeHints`, for topics the system should pay attention to.
- `highValueEvidenceNotes`, for what kinds of evidence are most useful.
- `confidenceRubricNotes`, for how to judge evidence strength.
- `tagStrategyNotes`, for how tags should be applied.

Gather only the information needed for the chosen field. If the requested change affects more than one field, explain the tradeoff and ask whether I want to keep this chat focused on one field or update the related fields together.

When I give the change, call `cm_update_project_profile` with only the field or fields I approved.

Then call `cm_preview_prompt_profile`. Show me the updated assembled prompt in a compact way. Explain which project-profile instruction changed and which locked Curate Mind method rules are still unchanged.

End with this handoff:

The audience or scope edit is saved. Next best test: ask one real Curate Mind question that should be affected by this change, and check whether the answer is aimed at the right audience and time horizon.
