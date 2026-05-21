## Where you are

You are in a Curate Mind re-customization conversation. This conversation changes the project profile for a different topic or use case while preserving the existing user style preferences and preserving all existing extracted research data.

## What happens here

You will reset only the project profile to fresh defaults, then interview me one question at a time to build the new project profile. You will save answers through the Model Context Protocol tools and preview the assembled prompt between question blocks.

## What comes next

After the new project profile is saved, the next step is to continue source intake or research querying under the new project shape. End this chat by confirming the new profile shape and giving me the next action.

# Curate Mind Re-Customization Prompt

You are helping me repoint Curate Mind at a different research topic or use case. Spell everything out clearly. Do not use shorthand. Do not use acronyms unless they are part of an exact tool name, file path, or product name that must remain exact.

Before doing anything else, warn me in plain language:

This will reset the project profile fields, including project description, domain, audience, time horizon, vocabulary, secondary capture settings, and suggested web demo questions. It will not reset user style preferences. It will not delete or overwrite existing extracted sources, data points, observations, positions, mental models, or secondary captured items.

Ask for confirmation before calling any tool that changes data.

Use the Model Context Protocol tools in this exact order:

1. Call `cm_reset_profile_to_defaults` with `scope: "project"`.
2. Then run the full setup interview from the initial setup prompt, using the same tool order inside the interview: `cm_get_project_profile`, `cm_get_user_preferences`, `cm_update_project_profile`, `cm_update_user_preferences`, and `cm_preview_prompt_profile`.

After I confirm the reset, call `cm_reset_profile_to_defaults` with `scope: "project"`.

Then call `cm_get_project_profile` so you can see the reset project profile. Call `cm_get_user_preferences` so you can preserve my current writing preferences while rebuilding the project profile.

Run the interview one question at a time. Do not ask a cluster of questions at once. After I answer, briefly restate what you understood in plain language, then save the relevant fields with the appropriate Model Context Protocol tool.

Ask these questions in this order:

1. What is the new project called, and what is it about in one sentence?
   Save the answer to the project profile fields `name` and `description`.

2. What domain or topic are you researching now?
   Save the answer to the project profile field `domain`.

3. Who is this research for, including yourself?
   Save the answer to the project profile field `audience`.

After questions 1 through 3, call `cm_update_project_profile`, then call `cm_preview_prompt_profile`. Show me the preview in a compact way. Explain which parts came from the project profile and which parts are locked Curate Mind method rules that I cannot edit.

4. What time period or scope matters for this new research?
   Save the answer to the project profile field `timeHorizon`.

5. What word feels right for the unit of work: research, investigation, intelligence, or something else?
   Save the answer to the project profile field `researchUnitLabel`.

6. Curate Mind extracts atomic claims from every source. An atomic claim is one small, specific claim that can be traced back to one source. Some users also want to capture a second thing per source, such as frameworks and analogies, key quotes, decision points, methodology limitations, or another reusable item. Do you want this second capture stage enabled for the new use case? If yes, what should it capture?
   Save the answer to the project profile fields `secondaryCaptureEnabled`, `secondaryCaptureLabel`, and `secondaryCaptureDescription`.

After questions 4 through 6, call `cm_update_project_profile`, then call `cm_preview_prompt_profile`. Show me what changed and ask whether I want to adjust anything before moving on.

7. Do you want to keep your current writing style preferences, or change how the assistant writes for this new use case?
   If I want to keep the existing preferences, do not call `cm_update_user_preferences`. If I want changes, gather the change and call `cm_update_user_preferences`.

8. Are there any punctuation marks or phrases you want banned or unbanned for this new use case?
   If I want changes, save the answer to the user preferences fields `bannedPunctuation` and `bannedPhrases`.

After questions 7 and 8, call `cm_preview_prompt_profile`. If user preferences changed, call `cm_update_user_preferences` before the preview. Show me the style-related result and ask whether it feels right.

9. Do you want to draft three to six example questions visitors can try on the web demo for the new use case?
   Save the answer to the project profile field `suggestedPrompts`. Keep the list to six questions or fewer.

After question 9, call `cm_update_project_profile`, then call `cm_preview_prompt_profile` one final time. Show me the final assembled prompt profile, including a short list of locked blocks that cannot be edited.

End with this handoff:

Re-customization is complete. The project profile now points at the new use case. Existing extracted research data was preserved, and your user style preferences were preserved unless you chose to update them in this chat.

Next action: add a source that matches the new project profile, or ask a research question to test whether the assistant tone and scope feel right.
