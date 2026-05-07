# Resource List Keyword Prefill Design

## Goal

When CoreAgent shows a list-style UI action card, it should carry clear user-provided filter keywords into the card search box. For example, if the user asks to list ecommerce workflows, CoreAgent should show the workflow list card with `params.query` set to `电商` or the equivalent phrase from the user request.

This applies to every `resource_list` action card, including workflow, datasource, table, schedule, knowledge folder, knowledge file, and template lists.

## Current Behavior

The backend already has the plumbing needed for search prefill:

- `show_ui_action_card` accepts `params`.
- `ShowUiActionCardTool` extracts `defaultQuery` from likely fields such as `query`, `keyword`, `name`, `title`, and id fields.
- `ResourceActionCard.vue` initializes its search input from `payload.defaultQuery` and immediately loads rows using that query.

The missing piece is the agent contract. CoreAgent is not explicitly required to pass a clear user keyword into `params.query` for list cards, so the frontend search box can remain empty even when the user's request includes an obvious filter.

## Chosen Approach

Strengthen the backend action-card contract rather than adding keyword inference to the frontend.

CoreAgent prompt rules will state that when the selected card is a `resource_list` card and the user request contains a clear filter keyword, CoreAgent must pass that keyword as `params.query` to `show_ui_action_card`.

The `show_ui_action_card` tool schema will document that `params.query` is used to prefill the search box for list cards. Catalog entries for list cards may expose optional query-like parameters where needed, so `search_ui_action_card` results tell the model that list filtering is supported.

## Data Flow

1. User asks for a filtered resource list, such as `列出电商类的工作流`.
2. CoreAgent routes the request to Operation Cards.
3. CoreAgent searches the catalog and selects the matching `resource_list` card, such as `workflow.open`.
4. CoreAgent calls `show_ui_action_card` with:

   ```json
   {
     "cardId": "workflow.open",
     "params": {
       "query": "电商"
     }
   }
   ```

5. `ShowUiActionCardTool` builds the card payload and sets `defaultQuery` from `params.query`.
6. The frontend renders `ResourceActionCard.vue`, initializes the search input from `payload.defaultQuery`, and fetches rows using that query.

## Keyword Rules

CoreAgent should pass a keyword only when the user provides a clear filter term or phrase. Examples:

- `列出电商类的工作流` -> `query: "电商"`
- `查找月报相关的定时任务` -> `query: "月报"`
- `show sales templates` -> `query: "sales"`
- `删除名字包含 test 的数据源` -> `query: "test"`

CoreAgent should not invent a keyword when the user asks for an unfiltered list, such as `列出所有工作流` or `打开知识库列表`.

For destructive cards, the existing safety rule still applies: if the target is unclear, CoreAgent asks for clarification before showing the card.

## Components

### CoreAgent Prompt

Add a concise Operation Cards rule:

- For every `resource_list` card, if the user request includes a clear filter keyword, pass it as `params.query` in `show_ui_action_card` so the card search box is prefilled.

### ShowUiActionCardTool

Keep current extraction behavior. Update the `params` schema description so the model understands that `query` prefilters list cards.

No sensitive handling changes are needed. Existing masking continues to apply only to sensitive parameters declared by catalog definitions.

### UI Action Card Catalog

Ensure resource list cards expose enough optional parameter hints for search filtering. Existing list/delete cards already use `query`, `keyword`, `name`, or `title` in many places; implementation should fill any gaps found during coding.

### Frontend

No behavior change is planned. `ResourceActionCard.vue` already uses `payload.defaultQuery` for its search input and initial fetch.

## Error Handling

If no clear keyword exists, the card is shown without `params.query` and the search box remains empty.

If `params.query` is present but no rows match, the existing resource-card empty state is shown.

If a card does not support resources correctly, existing `ResourceActionCard` error handling reports the missing resource type.

## Testing

Backend tests should cover the contract and payload behavior:

- `CORE_PROMPT` action-card tests assert that the prompt requires keyword prefill for all `resource_list` cards.
- `ShowUiActionCardTool` tests assert that a `query` parameter becomes `cardPayload.defaultQuery` for representative resource-list cards.
- A parameterized test should cover each current `resource_list` card id, so future catalog changes do not silently lose search prefill support.

Frontend tests do not need new coverage unless implementation changes the frontend, because existing `ResourceActionCard` tests already verify loading rows from `defaultQuery`.

## Out Of Scope

- Natural-language keyword extraction inside the frontend.
- Backend-side keyword extraction from chat history.
- Changing resource adapter search behavior.
- Changing card layout or visual design.
