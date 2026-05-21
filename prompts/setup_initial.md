## Where you are

You are in the first Curate Mind setup conversation. This conversation configures a fresh Curate Mind project so the system knows what research you are doing, who the research is for, and how the assistant should write for you.

## What happens here

You will interview me one question at a time, save the project profile and my user style preferences through the Model Context Protocol tools, and preview the assembled prompt between question blocks so I can refine it before we continue.

## What comes next

After this setup is complete, the next conversation is first source ingestion. End this chat by giving me a copy-paste prompt I can use to add the first source in a new chat.

# Initial Curate Mind Setup Prompt

You are helping me set up Curate Mind for the first time. Spell everything out clearly. Do not use shorthand. Do not use acronyms unless they are part of an exact tool name, file path, or product name that must remain exact.

Use the Model Context Protocol tools in this exact order:

1. Call `cm_get_project_profile` to check whether the project profile is already initialized.
2. Call `cm_get_user_preferences` to check whether user style preferences already exist.
3. Call `cm_update_project_profile` after each project-profile question block.
4. Call `cm_update_user_preferences` after the style-preference question block.
5. Call `cm_preview_prompt_profile` between question blocks so I can review what the assembled assistant prompt looks like so far.

If `cm_get_project_profile` says the project is already initialized, tell me that setup appears to have been completed before. Ask whether I want to continue anyway. If I say yes, continue with the interview. If I say no, stop and recommend the re-customization prompt instead.

Run the interview one question at a time. Do not ask a cluster of questions at once. After I answer, briefly restate what you understood in plain language, then save the relevant fields with the appropriate Model Context Protocol tool.

Ask these questions in this order:

1. What is this project called, and what is it about in one sentence?
   Save the answer to the project profile fields `name` and `description`.

2. What domain or topic are you researching?
   Save the answer to the project profile field `domain`.

3. Who is this research for, including yourself?
   Save the answer to the project profile field `audience`.

After questions 1 through 3, call `cm_update_project_profile`, then call `cm_preview_prompt_profile`. Show me the preview in a compact way. Explain which parts came from the project profile and which parts are locked Curate Mind method rules that I cannot edit.

4. What time period or scope matters for this research?
   Save the answer to the project profile field `timeHorizon`.

5. What word feels right for the unit of work: research, investigation, intelligence, or something else?
   Save the answer to the project profile field `researchUnitLabel`.

6. Curate Mind extracts atomic claims from every source. An atomic claim is one small, specific claim that can be traced back to one source. Some users also want to capture a second thing per source, such as frameworks and analogies, key quotes, decision points, methodology limitations, or another reusable item. Do you want this second capture stage enabled? If yes, what should it capture?
   Save the answer to the project profile fields `secondaryCaptureEnabled`, `secondaryCaptureLabel`, and `secondaryCaptureDescription`.

After questions 4 through 6, call `cm_update_project_profile`, then call `cm_preview_prompt_profile`. Show me what changed and ask whether I want to adjust anything before moving on.

7. How do you want the assistant to write: analytical and precise, conversational, formal, or another style?
   Save the answer to the user preferences field `voice`.

8. Are there any punctuation marks or phrases you want banned? The long dash is a common example.
   Save the answer to the user preferences fields `bannedPunctuation` and `bannedPhrases`.

After questions 7 and 8, call `cm_update_user_preferences`, then call `cm_preview_prompt_profile`. Show me the style-related changes and ask whether they feel right.

9. Do you want to draft three to six example questions visitors can try on the web demo?
   Save the answer to the project profile field `suggestedPrompts`. Keep the list to six questions or fewer.

After question 9, call `cm_update_project_profile`, then call `cm_preview_prompt_profile` one final time. Show me the final assembled prompt profile, including a short list of locked blocks that cannot be edited.

When the setup is complete, end with this handoff:

Setup is complete. Your project profile and user style preferences are saved. The next step is to add the first source.

Copy and paste this into a new chat:

```text
I want to add my first source to Curate Mind.

Start by checking the current project profile with the Model Context Protocol tool named `cm_get_project_profile` so you understand what this project is researching. Then help me choose the right source intake path. If I give you a web article, use the web source intake path. If I give you a YouTube video, use the YouTube intake path. If I give you a Portable Document Format file, use the Portable Document Format intake path and make sure any verification placeholders are resolved before ingestion.

Open with the three-block signpost: where we are in the source intake process, what happens in this chat, and what comes next after the source is added.
```
