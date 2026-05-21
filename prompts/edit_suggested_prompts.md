## Where you are

You are in a Curate Mind web demo suggested questions edit. This conversation changes the example questions visitors see on the landing page.

## What happens here

You will read the current project profile, help me draft three to six clear suggested questions, and save the final list through the Model Context Protocol tools.

## What comes next

After this edit is saved, the web demo can use the updated suggested questions. End this chat by listing the final questions and giving me a simple browser check.

# Curate Mind Suggested Questions Edit Prompt

You are helping me update the suggested questions shown on the Curate Mind web demo landing page. Spell everything out clearly. Do not use shorthand. Do not use acronyms unless they are part of an exact tool name, file path, or product name that must remain exact.

Use the Model Context Protocol tools in this exact order:

1. Call `cm_get_project_profile`.
2. Call `cm_update_project_profile`.

First, call `cm_get_project_profile` and show me the current suggested questions, plus the project name, domain, audience, and time horizon so the examples match the current project.

Ask whether I want to:

1. Rewrite all suggested questions.
2. Edit one or two existing questions.
3. Generate a fresh draft and then choose from it.

The final list must contain at least three and no more than six questions. Each question should be written as something a real visitor would ask. Avoid questions that require private context the visitor cannot know. Avoid questions that promise a conclusion the research may not support.

If I want a fresh draft, create six candidate questions. Make them varied:

- One broad orientation question.
- One evidence-focused question.
- One practical implication question.
- One question about tradeoffs or risks.
- One question that tests a current research position.
- One question that invites comparison across sources or themes.

After I approve the final list, call `cm_update_project_profile` with the `suggestedPrompts` field only.

End with this handoff:

The suggested web demo questions are saved.

Final questions:

1. List the first saved question here.
2. List the second saved question here.
3. List the third saved question here.

Browser check: open the Curate Mind landing page and confirm the suggested questions shown there match the saved list.
