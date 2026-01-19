-- Official Channels Migration
-- Adds official channels for cities, crypto, tech, gaming, sports, music, art, languages

-- =====================================================
-- CITIES - Top 25 Major Global Cities
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('New York', 'The city that never sleeps. NYC community.', '🗽', 'cities', true, true),
('London', 'Chat with Londoners and UK enthusiasts.', '🇬🇧', 'cities', true, true),
('Tokyo', 'Japan''s capital city community.', '🗼', 'cities', true, true),
('Paris', 'The city of lights. French and expat community.', '🗼', 'cities', true, true),
('Singapore', 'Lion City community and Southeast Asia hub.', '🇸🇬', 'cities', true, true),
('Hong Kong', 'Asia''s world city community.', '🏙️', 'cities', true, true),
('Dubai', 'UAE and Middle East community.', '🏜️', 'cities', true, true),
('Sydney', 'Australia''s harbour city community.', '🦘', 'cities', true, true),
('San Francisco', 'Bay Area tech and culture.', '🌉', 'cities', true, true),
('Los Angeles', 'LA and Southern California vibes.', '🌴', 'cities', true, true),
('Shanghai', 'China''s financial hub community.', '🏙️', 'cities', true, true),
('Seoul', 'South Korea''s capital community.', '🇰🇷', 'cities', true, true),
('Berlin', 'Germany''s creative capital.', '🇩🇪', 'cities', true, true),
('Toronto', 'Canada''s largest city community.', '🍁', 'cities', true, true),
('Chicago', 'The Windy City community.', '🌆', 'cities', true, true),
('Miami', 'Magic City and Latin America gateway.', '🌴', 'cities', true, true),
('Austin', 'Keep Austin Weird. Texas tech hub.', '🤠', 'cities', true, true),
('Amsterdam', 'Netherlands and European hub.', '🇳🇱', 'cities', true, true),
('Mumbai', 'India''s financial capital community.', '🇮🇳', 'cities', true, true),
('São Paulo', 'Brazil and South America''s largest city.', '🇧🇷', 'cities', true, true),
('Mexico City', 'CDMX and Latin America hub.', '🇲🇽', 'cities', true, true),
('Lagos', 'Nigeria and West Africa tech hub.', '🇳🇬', 'cities', true, true),
('Jakarta', 'Indonesia''s capital community.', '🇮🇩', 'cities', true, true),
('Bangkok', 'Thailand''s vibrant capital.', '🇹🇭', 'cities', true, true),
('Zurich', 'Swiss finance and crypto hub.', '🇨🇭', 'cities', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- CRYPTO & WEB3
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Ethereum', 'ETH ecosystem discussions and news.', '⟠', 'crypto', true, true),
('Bitcoin', 'BTC and digital gold discussions.', '₿', 'crypto', true, true),
('Solana', 'SOL ecosystem and community.', '◎', 'crypto', true, true),
('NFTs', 'Non-fungible tokens, art, and collectibles.', '🖼️', 'crypto', true, true),
('DeFi', 'Decentralized finance discussions.', '🏦', 'crypto', true, true),
('DAOs', 'Decentralized autonomous organizations.', '🏛️', 'crypto', true, true),
('Layer 2s', 'L2 scaling solutions and rollups.', '⚡', 'crypto', true, true),
('Trading', 'Crypto trading strategies and analysis.', '📊', 'crypto', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- TECH
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('AI & Machine Learning', 'Artificial intelligence and ML discussions.', '🤖', 'tech', true, true),
('Web Development', 'Frontend, backend, and fullstack dev.', '🌐', 'tech', true, true),
('Mobile Development', 'iOS, Android, and cross-platform.', '📱', 'tech', true, true),
('Startups', 'Startup founders, ideas, and growth.', '🚀', 'tech', true, true),
('Open Source', 'Open source projects and contributions.', '💻', 'tech', true, true),
('Cybersecurity', 'Security, privacy, and infosec.', '🔒', 'tech', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- GAMING
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Gaming General', 'All things gaming.', '🎮', 'gaming', true, true),
('PC Gaming', 'PC master race and builds.', '🖥️', 'gaming', true, true),
('Console Gaming', 'PlayStation, Xbox, Nintendo.', '🕹️', 'gaming', true, true),
('Esports', 'Competitive gaming and tournaments.', '🏆', 'gaming', true, true),
('Indie Games', 'Independent game developers and titles.', '🎲', 'gaming', true, true),
('Web3 Gaming', 'Blockchain games and play-to-earn.', '⛓️', 'gaming', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- SPORTS
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Football', 'Soccer/football worldwide.', '⚽', 'sports', true, true),
('Basketball', 'NBA, FIBA, and basketball talk.', '🏀', 'sports', true, true),
('Formula 1', 'F1 racing and motorsports.', '🏎️', 'sports', true, true),
('American Football', 'NFL and college football.', '🏈', 'sports', true, true),
('Tennis', 'ATP, WTA, and Grand Slams.', '🎾', 'sports', true, true),
('Combat Sports', 'MMA, boxing, and martial arts.', '🥊', 'sports', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- MUSIC
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Hip Hop', 'Rap and hip hop culture.', '🎤', 'music', true, true),
('Electronic', 'EDM, house, techno, and more.', '🎧', 'music', true, true),
('Rock & Metal', 'Rock, metal, and alternative.', '🎸', 'music', true, true),
('Pop', 'Pop music and mainstream hits.', '🎵', 'music', true, true),
('Jazz & Soul', 'Jazz, soul, R&B, and classics.', '🎷', 'music', true, true),
('Music Production', 'Producing, mixing, and DAWs.', '🎹', 'music', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- ART & CREATIVE
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Digital Art', 'Digital artists and creations.', '🎨', 'art', true, true),
('Photography', 'Photo sharing and techniques.', '📸', 'art', true, true),
('Graphic Design', 'Design, branding, and visual arts.', '✏️', 'art', true, true),
('3D & Animation', '3D modeling and animation.', '🎬', 'art', true, true),
('AI Art', 'AI-generated art and tools.', '🤖', 'art', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- LIFESTYLE
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Food & Cooking', 'Recipes, restaurants, and cuisine.', '🍳', 'lifestyle', true, true),
('Travel', 'Travel tips, destinations, and stories.', '✈️', 'lifestyle', true, true),
('Fitness', 'Workouts, health, and wellness.', '💪', 'lifestyle', true, true),
('Fashion', 'Style, fashion, and trends.', '👗', 'lifestyle', true, true),
('Books & Reading', 'Book recommendations and discussions.', '📚', 'lifestyle', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- LANGUAGES
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Spanish', 'Hablemos español! Spanish speakers.', '🇪🇸', 'languages', true, true),
('French', 'Parlons français! French speakers.', '🇫🇷', 'languages', true, true),
('Portuguese', 'Vamos falar português! Portuguese speakers.', '🇧🇷', 'languages', true, true),
('Japanese', '日本語で話そう! Japanese learners & speakers.', '🇯🇵', 'languages', true, true),
('Mandarin', '说中文! Chinese speakers and learners.', '🇨🇳', 'languages', true, true),
('German', 'Lass uns Deutsch sprechen! German speakers.', '🇩🇪', 'languages', true, true),
('Korean', '한국어로 대화해요! Korean speakers.', '🇰🇷', 'languages', true, true),
('Arabic', 'تحدث العربية! Arabic speakers.', '🇸🇦', 'languages', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- FINANCE
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Stocks & Investing', 'Stock market and investment discussions.', '📈', 'finance', true, true),
('Personal Finance', 'Budgeting, saving, and money management.', '💰', 'finance', true, true),
('Real Estate', 'Property investing and housing.', '🏠', 'finance', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- SCIENCE
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Space & Astronomy', 'Space exploration and the cosmos.', '🚀', 'science', true, true),
('Physics', 'Physics discussions and discoveries.', '⚛️', 'science', true, true),
('Climate & Environment', 'Climate science and sustainability.', '🌍', 'science', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- ENTERTAINMENT
-- =====================================================
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Movies', 'Film discussions and recommendations.', '🎬', 'entertainment', true, true),
('TV Shows', 'Series, streaming, and binge-watching.', '📺', 'entertainment', true, true),
('Anime', 'Anime and manga discussions.', '🍥', 'entertainment', true, true),
('Memes', 'Share and enjoy memes.', '😂', 'entertainment', true, true)
ON CONFLICT (name) DO NOTHING;
