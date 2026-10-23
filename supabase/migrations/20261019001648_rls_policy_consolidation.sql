-- Phase 4 performance pass (advisors 0003 auth_rls_initplan + 0006 multiple_permissive_policies).
-- 1) mfa_required_when_enrolled: `(select auth.jwt() ->> 'aal')` was already one evaluation per statement,
--    but the linter only recognises `(select auth.jwt())`; same meaning, written the way it expects.
-- 2) Every table/role/command that had two or three PERMISSIVE policies now has one. Permissive policies
--    are OR-ed, so each merged policy is the OR of the ones it replaces:
--      USING      = OR of the old USING expressions
--      WITH CHECK = OR of the old WITH CHECK expressions (a missing WITH CHECK meant "same as USING").
--    Policies that were `TO public` but can only ever match a signed-in user (they compare against
--    auth.uid() / user_org_id() / user_role(), all NULL for anon) are now `TO authenticated`.
--    Policies anon really uses (approved clubs, their active courts and slot locks) keep anon.
-- 3) Row-independent helpers (user_org_id(), user_role(), auth.uid()) are wrapped in (select ...) so they
--    run once per statement instead of once per row.
-- No access changes: checked in a rolled-back transaction against every real account before applying.

-- ---- 1. MFA restrictive policies (unchanged meaning) ------------------------------------------------

ALTER POLICY mfa_required_when_enrolled ON public.organizations
  USING (((select auth.jwt()) ->> 'aal') = 'aal2' OR NOT (select public.user_has_verified_totp()))
  WITH CHECK (((select auth.jwt()) ->> 'aal') = 'aal2' OR NOT (select public.user_has_verified_totp()));

ALTER POLICY mfa_required_when_enrolled ON public.api_keys
  USING (((select auth.jwt()) ->> 'aal') = 'aal2' OR NOT (select public.user_has_verified_totp()))
  WITH CHECK (((select auth.jwt()) ->> 'aal') = 'aal2' OR NOT (select public.user_has_verified_totp()));

ALTER POLICY mfa_required_when_enrolled ON public.staff_invites
  USING (((select auth.jwt()) ->> 'aal') = 'aal2' OR NOT (select public.user_has_verified_totp()))
  WITH CHECK (((select auth.jwt()) ->> 'aal') = 'aal2' OR NOT (select public.user_has_verified_totp()));

-- ---- 2. bookings ----------------------------------------------------------------------------------

DROP POLICY "Members can view their own bookings" ON public.bookings;
DROP POLICY "Players can view their own bookings" ON public.bookings;
CREATE POLICY "Bookers and club staff can view bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    booker_profile_id = (select auth.uid())
    OR (org_id = (select public.user_org_id()) AND (select public.user_role()) = ANY (ARRAY['org_admin', 'staff']))
  );

DROP POLICY "Org admins can update any booking in their org" ON public.bookings;
DROP POLICY "Players can cancel their own bookings before deadline" ON public.bookings;
CREATE POLICY "Club staff update, bookers cancel before deadline" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    (org_id = (select public.user_org_id()) AND (select public.user_role()) = ANY (ARRAY['org_admin', 'staff']))
    OR (booker_profile_id = (select auth.uid()) AND now() < cancellation_deadline)
  )
  WITH CHECK (
    (org_id = (select public.user_org_id()) AND (select public.user_role()) = ANY (ARRAY['org_admin', 'staff']))
    OR (booker_profile_id = (select auth.uid()) AND status = 'cancelled')
  );

-- ---- 3. court_slot_locks --------------------------------------------------------------------------

DROP POLICY "Anyone can view slot locks of public courts" ON public.court_slot_locks;
DROP POLICY "Users can view slot locks in their org" ON public.court_slot_locks;
CREATE POLICY "View slot locks of public courts or own club" ON public.court_slot_locks
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.courts c
       WHERE c.id = court_slot_locks.court_id
         AND (
           (c.status = 'active' AND c.deleted_at IS NULL AND public.org_is_approved(c.org_id))
           OR c.org_id = (select public.user_org_id())
         )
    )
  );

-- ---- 4. courts ------------------------------------------------------------------------------------
-- anon keeps the public rule only (its own-org rule never matched). The bookings sub-select stays
-- authenticated-only: anon has no SELECT on bookings.

DROP POLICY "Anyone can view active courts of approved organizations" ON public.courts;
DROP POLICY "Players can view courts of their bookings" ON public.courts;
DROP POLICY "Users can view courts in their org" ON public.courts;
CREATE POLICY "Anyone can view active courts of approved organizations" ON public.courts
  FOR SELECT TO anon
  USING (status = 'active' AND deleted_at IS NULL AND public.org_is_approved(org_id));
CREATE POLICY "Users can view public, own-club and booked courts" ON public.courts
  FOR SELECT TO authenticated
  USING (
    (status = 'active' AND deleted_at IS NULL AND public.org_is_approved(org_id))
    OR org_id = (select public.user_org_id())
    OR EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.court_id = courts.id AND b.booker_profile_id = (select auth.uid())
    )
  );

-- ---- 5. organizations -----------------------------------------------------------------------------

DROP POLICY "Players can view clubs of their bookings" ON public.organizations;
DROP POLICY "Users can view their own organization" ON public.organizations;
CREATE POLICY "Users can view their own club and clubs they booked" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    id = (select public.user_org_id())
    OR EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.org_id = organizations.id AND b.booker_profile_id = (select auth.uid())
    )
  );

-- The two platform-admin UPDATE policies were identical; the owner one may not change the status.
DROP POLICY "Org admins can update their org details (not status)" ON public.organizations;
DROP POLICY "Platform admins can update organization status" ON public.organizations;
DROP POLICY "Platform admins can update organizations" ON public.organizations;
CREATE POLICY "Platform admins update clubs, owners update details (not status)" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    (select public.user_role()) = 'platform_admin'
    OR (id = (select public.user_org_id()) AND (select public.user_role()) = 'org_admin')
  )
  WITH CHECK (
    (select public.user_role()) = 'platform_admin'
    OR (
      id = (select public.user_org_id())
      AND (select public.user_role()) = 'org_admin'
      AND status = (SELECT o.status FROM public.organizations o WHERE o.id = (select public.user_org_id()))
    )
  );

-- ---- 6. profiles ----------------------------------------------------------------------------------

DROP POLICY "Club staff can view players who booked with them" ON public.profiles;
DROP POLICY "Org admins can view all profiles in their org" ON public.profiles;
DROP POLICY "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users view self, club staff view their club and its players" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (select auth.uid())
    OR (org_id = (select public.user_org_id()) AND (select public.user_role()) = ANY (ARRAY['org_admin', 'staff']))
    OR (role = 'player' AND public.booked_with_my_club(id))
  );

-- Column grants still limit what each caller may change (display_name, phone, avatar_url for clients).
DROP POLICY "Org admins can update profiles in their org" ON public.profiles;
DROP POLICY "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users update self, owners update their club" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = (select auth.uid())
    OR (org_id = (select public.user_org_id()) AND (select public.user_role()) = 'org_admin')
  );

-- ---- 7. staff_invites -----------------------------------------------------------------------------

DROP POLICY "Org admins can view staff invites in their org" ON public.staff_invites;
DROP POLICY "Recipients can view their own invite" ON public.staff_invites;
CREATE POLICY "Owners and recipients can view staff invites" ON public.staff_invites
  FOR SELECT TO authenticated
  USING (
    (org_id = (select public.user_org_id()) AND (select public.user_role()) = 'org_admin')
    OR lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
