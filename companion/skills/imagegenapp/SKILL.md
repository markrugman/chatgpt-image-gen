---
name: imagegenapp
description: Start a poster or image design in the local Image Gen desktop app, placing it in an organisation and project and opening its page conversation.
---

Use the Image Gen tools to create the design and open its conversation in the desktop app on this computer.

- Call `list_workspace` to resolve the user's organisation and project. Match names exactly, ignoring case. Ask about ambiguous destinations; if the organisation is missing, have the user add it in the app. A missing project can be created by `start_design`.
- For "create a poster" or an explicit generation request, set `mode` to `generate`. For "start a poster project" or a request to prepare a brief, set it to `discuss`. The discussion mode saves the opening brief without generating an image.
- Send the user's design brief, a document name, and dimensions to `start_design`. A4 is 210 × 297 mm; A3 is 297 × 420 mm. Ask for size when it is not supplied or clear from context. Preserve supplied wording and include only relevant context from this chat.
- Generate one unique `requestId` per requested document. Reuse it for retries of the same handoff. A successfully created document must not be recreated merely because a later generation fails.
- Report the actual returned destination and whether generation started or the brief is ready for discussion. The remaining conversation takes place in Image Gen. Only claim the app opened if the tool confirms it.

If the tools are unavailable, explain that the local Image Gen companion connection must be enabled. This integration starts a new app conversation; it does not import the whole ChatGPT thread or provide continuous chat mirroring.
