import { Request, Response, NextFunction } from "express";
import db from "../db.js";
import { UserRole } from "../types/index.js";

const VALID_ROLES: UserRole[] = ["admin", "instructor", "student"];

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId   = req.headers["x-user-id"] as string | undefined;
  const userRole = req.headers["x-user-role"] as string | undefined;
  const tenantId = req.headers["x-tenant-id"] as string | undefined;

  // 1. All three headers are required
  if (!userId || !userRole || !tenantId) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing required headers: x-user-id, x-user-role, x-tenant-id",
    });
    return;
  }

  // 2. Role must be a known value
  if (!VALID_ROLES.includes(userRole as UserRole)) {
    res.status(401).json({
      error: "Unauthorized",
      message: `Invalid role '${userRole}'. Must be one of: ${VALID_ROLES.join(", ")}`,
    });
    return;
  }

  // 3. Confirm user exists in the DB, is active, and belongs to the tenant
  const person = await db("people")
    .where({ id: userId, tenant_id: tenantId })
    .first();

  if (!person) {
    res.status(401).json({
      error: "Unauthorized",
      message: "User not found or does not belong to this tenant",
    });
    return;
  }

  if (person.status !== "active") {
    res.status(403).json({
      error: "Forbidden",
      message: `Account is ${person.status}. Only active users may access this API.`,
    });
    return;
  }

  // 4. Cross-check: header role must match DB role 
  if (person.role !== userRole) {
    res.status(403).json({
      error: "Forbidden",
      message: "Role in header does not match the role on record",
    });
    return;
  }

  // 5. Attach to request for downstream use
  req.user = {
    id: userId,
    role: userRole as UserRole,
    tenant_id: tenantId,
  };

  next();
}

// ─── Role guard helpers (used inside route handlers) ─────────────────────────

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: "Forbidden",
        message: `This action requires one of the following roles: ${roles.join(", ")}`,
      });
      return;
    }
    next();
  };
}