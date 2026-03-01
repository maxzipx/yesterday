insert into public.feed_sources (name, url, is_enabled)
values
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
  ('CBS News - Latest', 'https://www.cbsnews.com/latest/rss/main', true),
  ('Reuters - World News', 'https://news.google.com/rss/search?q=site:reuters.com%20when:1d&hl=en-US&gl=US&ceid=US:en', true),
  ('AP News - Top Headlines', 'https://news.google.com/rss/search?q=site:apnews.com%20when:1d&hl=en-US&gl=US&ceid=US:en', true),
  ('The Hill - News', 'https://thehill.com/feed/', true),
  ('Deutsche Welle (DW) - Top Stories', 'https://rss.dw.com/rdf/rss-en-top', true),
  ('South China Morning Post - World', 'https://www.scmp.com/rss/91/feed', true),
  ('The Economist - International', 'https://www.economist.com/international/rss.xml', true),
  ('Yahoo Finance - News', 'https://finance.yahoo.com/news/rssindex', true),
  ('Foreign Affairs - Latest', 'https://www.foreignaffairs.com/rss.xml', true),
  ('Brookings Institution - Research', 'https://www.brookings.edu/feed/', true),
  ('Inside Climate News', 'https://insideclimatenews.org/feed/', true)
on conflict (url) do update
set
  name = excluded.name,
  is_enabled = excluded.is_enabled;

