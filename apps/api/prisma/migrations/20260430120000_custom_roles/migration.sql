-- Custom (Discord-style) roles: admin-defined permission bundles assigned
-- to users on top of their built-in UserRole/account type.

CREATE TABLE "Role" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "color"       TEXT NOT NULL DEFAULT '#99aab5',
    "position"    INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isSystem"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");
CREATE INDEX "Role_position_idx" ON "Role"("position");

CREATE TABLE "RolePermission" (
    "id"         TEXT NOT NULL,
    "roleId"     TEXT NOT NULL,
    "permission" "PermissionCode" NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePermission_roleId_permission_key" ON "RolePermission"("roleId", "permission");
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

ALTER TABLE "RolePermission"
  ADD CONSTRAINT "RolePermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserRoleAssignment" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "roleId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserRoleAssignment_userId_roleId_key" ON "UserRoleAssignment"("userId", "roleId");
CREATE INDEX "UserRoleAssignment_userId_idx" ON "UserRoleAssignment"("userId");
CREATE INDEX "UserRoleAssignment_roleId_idx" ON "UserRoleAssignment"("roleId");

ALTER TABLE "UserRoleAssignment"
  ADD CONSTRAINT "UserRoleAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRoleAssignment"
  ADD CONSTRAINT "UserRoleAssignment_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
