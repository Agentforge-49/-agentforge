insert into public.tools (
  slug,
  display_name,
  description,
  icon,
  is_available,
  requires_pro
)
values
  ('web_search', 'Web Search', 'Search the public web for current information.', 'search', true, false),
  ('calculator', 'Calculator', 'Perform reliable arithmetic calculations.', 'calculator', true, false),
  ('datetime', 'Date and Time', 'Read and calculate dates and times.', 'calendar', true, false),
  ('memory', 'Memory', 'Store and recall information during agent work.', 'brain', true, false),
  ('summarizer', 'Summarizer', 'Summarize long text in a selected format.', 'file-text', true, false),
  ('webhook', 'Webhook', 'Call an approved public HTTP endpoint.', 'webhook', true, false),
  ('read_webpage', 'Read Webpage', 'Extract readable text from a public webpage.', 'globe', true, false)
on conflict (slug) do update
set display_name = excluded.display_name,
    description = excluded.description,
    icon = excluded.icon,
    is_available = excluded.is_available,
    requires_pro = excluded.requires_pro;
