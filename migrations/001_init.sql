CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email varchar(255) NOT NULL,
  password_hash text NOT NULL,
  name varchar(50) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));

CREATE TABLE movies (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title varchar(200) NOT NULL,
  runtime_min smallint NOT NULL CHECK (runtime_min > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (title)
);

CREATE TABLE screens (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(50) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (name)
);

CREATE TABLE seats (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  screen_id integer NOT NULL REFERENCES screens(id),
  row_label varchar(2) NOT NULL,
  col_no smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (screen_id, row_label, col_no),
  UNIQUE (id, screen_id)
);

CREATE TABLE screenings (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  movie_id integer NOT NULL REFERENCES movies(id),
  screen_id integer NOT NULL REFERENCES screens(id),
  starts_at timestamptz NOT NULL,
  base_price integer NOT NULL CHECK (base_price >= 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (id, screen_id),
  UNIQUE (movie_id, screen_id, starts_at)
);
CREATE INDEX idx_screenings_movie_time ON screenings (movie_id, starts_at);

CREATE TABLE reservations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id uuid NOT NULL DEFAULT uuidv7() UNIQUE,
  user_id integer NOT NULL REFERENCES users(id),
  screening_id integer NOT NULL REFERENCES screenings(id),
  total_price integer NOT NULL CHECK (total_price >= 0),
  reserved_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (id, screening_id),
  UNIQUE (id, user_id)
);
CREATE INDEX idx_reservations_user_recent
  ON reservations (user_id, reserved_at DESC, id DESC);

CREATE TABLE screening_seats (
  screening_id integer NOT NULL,
  screen_id integer NOT NULL,
  seat_id integer NOT NULL,
  reservation_id bigint,
  PRIMARY KEY (screening_id, seat_id),
  FOREIGN KEY (screening_id, screen_id) REFERENCES screenings(id, screen_id),
  FOREIGN KEY (seat_id, screen_id) REFERENCES seats(id, screen_id),
  FOREIGN KEY (reservation_id, screening_id) REFERENCES reservations(id, screening_id)
);
CREATE INDEX idx_ss_reservation ON screening_seats (reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE TABLE reservation_idempotency_keys (
  user_id integer NOT NULL REFERENCES users(id),
  idempotency_key varchar(255) NOT NULL,
  request_hash text NOT NULL,
  reservation_id bigint,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (user_id, idempotency_key),
  FOREIGN KEY (reservation_id, user_id) REFERENCES reservations(id, user_id)
);
