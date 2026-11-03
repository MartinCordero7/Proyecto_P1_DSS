-- STEGO database: persistence of steganography analysis results (Persona 2).
-- This database belongs exclusively to STEGO. AUTH's tables (users, roles, user_roles) are never
-- accessed from here: user_id only stores the identifier received in the JWT "sub" claim.

CREATE TABLE IF NOT EXISTS analysis_results (
  analysis_id  UUID         PRIMARY KEY,
  user_id      UUID         NOT NULL,
  filename     VARCHAR(255) NOT NULL,
  sha256       CHAR(64)     NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  technique    VARCHAR(64)  NOT NULL,
  status       VARCHAR(20)  NOT NULL
               CHECK (status IN ('sin_indicios', 'sospechoso', 'no_concluyente', 'con_error')),
  action       VARCHAR(20)  NOT NULL
               CHECK (action IN ('aprobado', 'advertencia', 'cuarentena', 'rechazo')),
  indicators   JSONB        NOT NULL,
  limitations  TEXT         NOT NULL,
  analyzed_at  TIMESTAMPTZ  NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Results of one user, newest first (ownership checks and listings).
CREATE INDEX IF NOT EXISTS idx_analysis_results_user
  ON analysis_results (user_id, analyzed_at DESC);

-- Look up every analysis of the same file content.
CREATE INDEX IF NOT EXISTS idx_analysis_results_sha256
  ON analysis_results (sha256);
