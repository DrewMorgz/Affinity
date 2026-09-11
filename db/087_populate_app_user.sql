-- 087 — put the staff into the segregation-of-duties user table
--
-- FOUND BY TESTING A BUTTON RATHER THAN READING THE SCHEMA. assign_user_role
-- grants a functional role and refuses where the person already holds a
-- conflicting one. sod_conflict already defines the conflict that matters:
-- preparer against approver.
--
-- It could not work for anybody. There are two user tables:
--
--   sys_user    16 rows. Who works here, their job title, office, status.
--   app_user     0 rows. Usernames for the functional-role system, and what
--                app_user_role has a foreign key to.
--
-- So every attempt to grant a role failed on that foreign key, and the
-- segregation-of-duties check could never fire — not because it was wrong, but
-- because there was nobody for it to be wrong about.
--
-- THE TWO-TABLE ARRANGEMENT IS NOT FIXED HERE. Merging them is a bigger change
-- than this should be, and one worth doing deliberately rather than in passing.
-- What this does is keep them in step, so the check works and stays working.

-- ── Populate from the staff list ───────────────────────────────────────────
INSERT INTO app_user (username, full_name, is_active)
SELECT lower(trim(u.email)), u.name, coalesce(u.status, '') <> 'Suspended'
  FROM sys_user u
 WHERE coalesce(trim(u.email), '') <> ''
ON CONFLICT (username) DO UPDATE
   SET full_name = excluded.full_name,
       is_active = excluded.is_active;

-- ── Keep them in step ──────────────────────────────────────────────────────
-- Without this, a new joiner appears in sys_user and not in app_user, and the
-- first attempt to grant them a role fails with a foreign key error that says
-- nothing about the cause. A trigger rather than a documented manual step,
-- because a manual step that is only needed occasionally is a manual step
-- nobody remembers.
CREATE OR REPLACE FUNCTION app_user_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(trim(NEW.email), '') = '' THEN
    RETURN NEW;                       -- nothing to key on
  END IF;
  INSERT INTO app_user (username, full_name, is_active)
  VALUES (lower(trim(NEW.email)), NEW.name,
          coalesce(NEW.status, '') <> 'Suspended')
  ON CONFLICT (username) DO UPDATE
     SET full_name = excluded.full_name,
         is_active = excluded.is_active;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_user_sync ON sys_user;
CREATE TRIGGER trg_app_user_sync
  AFTER INSERT OR UPDATE OF email, name, status ON sys_user
  FOR EACH ROW EXECUTE FUNCTION app_user_sync();

COMMENT ON FUNCTION app_user_sync() IS
  'Keeps app_user in step with sys_user. Without it a new joiner exists in one '
  'table and not the other, and granting them a functional role fails on a '
  'foreign key with an error that does not explain why.';

-- ── A clearer refusal when the username is genuinely unknown ───────────────
-- The foreign key error names a constraint. This names the problem.
CREATE OR REPLACE FUNCTION assign_user_role(p_user text, p_role text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE v_conflict text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_user WHERE username = lower(trim(p_user))) THEN
    RAISE EXCEPTION
      'There is no user %. Functional roles are granted to a staff email address '
      'that already exists in Core — check the address, or add the person on the '
      'Users tab first.', p_user;
  END IF;

  SELECT CASE WHEN c.role_a = p_role THEN c.role_b ELSE c.role_a END
    INTO v_conflict
    FROM sod_conflict c
    JOIN app_user_role ur
      ON ur.username = lower(trim(p_user))
     AND ur.role_code = CASE WHEN c.role_a = p_role THEN c.role_b ELSE c.role_a END
   WHERE p_role IN (c.role_a, c.role_b)
   LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION
      'Segregation of duties: % already holds %, and one person cannot hold both. '
      'The two-person rules elsewhere refuse at the moment of the act; this stops '
      'the roles accumulating in the first place.', p_user, v_conflict;
  END IF;

  INSERT INTO app_user_role (username, role_code)
  VALUES (lower(trim(p_user)), p_role)
  ON CONFLICT DO NOTHING;
END;
$$;

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('assign_user_role', 'app_user_sync')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $g$;
