-- Create tags table
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(7) NOT NULL DEFAULT '#888888',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for tag name
CREATE INDEX idx_tags_name ON tags(name);

-- Create contract_tags junction table
CREATE TABLE contract_tags (
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (contract_id, tag_id)
);

-- Index for junction table
CREATE INDEX idx_contract_tags_tag_id ON contract_tags(tag_id);
CREATE INDEX idx_contract_tags_contract_id ON contract_tags(contract_id);

-- Migrate existing tags from contracts.tags array
-- First, insert unique tags into the tags table
INSERT INTO tags (name)
SELECT DISTINCT unnest(tags)
FROM contracts
ON CONFLICT (name) DO NOTHING;

-- Second, populate the junction table
INSERT INTO contract_tags (contract_id, tag_id)
SELECT c.id, t.id
FROM contracts c
CROSS JOIN unnest(c.tags) AS tag_name
JOIN tags t ON t.name = tag_name
ON CONFLICT DO NOTHING;

-- Finally, drop the tags column from contracts
ALTER TABLE contracts DROP COLUMN tags;
