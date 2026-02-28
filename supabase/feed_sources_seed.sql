insert into public.feed_sources (name, url, is_enabled)
values
  ('Reuters - Top News', 'https://feeds.reuters.com/reuters/topNews', true),
  ('Associated Press - Top News', 'https://apnews.com/rss/apf-topnews', true),
  ('The Guardian - World', 'https://www.theguardian.com/world/rss', true),
  ('Bloomberg - Markets News', 'https://feeds.bloomberg.com/markets/news.rss', true),
  ('Wall Street Journal - World News', 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', true),
  ('Financial Times - World', 'https://www.ft.com/world?format=rss', true),
  ('The Verge', 'https://www.theverge.com/rss/index.xml', true),
  ('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', true),
  ('TechCrunch', 'https://techcrunch.com/feed/', true),
  ('ScienceDaily - Top Science', 'https://www.sciencedaily.com/rss/top/science.xml', true),
  ('Nature - News', 'https://www.nature.com/nature.rss', true),
  ('Politico - Picks', 'https://www.politico.com/rss/politicopicks.xml', true),
  ('Al Jazeera - All News', 'https://www.aljazeera.com/xml/rss/all.xml', true),
  ('CBS News - Latest', 'https://www.cbsnews.com/latest/rss/main', true)
on conflict (url) do update
set
  name = excluded.name,
  is_enabled = excluded.is_enabled;

