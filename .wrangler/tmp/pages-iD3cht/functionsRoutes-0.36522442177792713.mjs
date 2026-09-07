import { onRequestPost as __api_admin_create_branch_ts_onRequestPost } from "C:\\Users\\Emanuel\\OneDrive\\Área de Trabalho\\hd-system\\functions\\api\\admin\\create-branch.ts"
import { onRequestPost as __api_admin_create_organization_ts_onRequestPost } from "C:\\Users\\Emanuel\\OneDrive\\Área de Trabalho\\hd-system\\functions\\api\\admin\\create-organization.ts"
import { onRequestPost as __api_admin_create_user_ts_onRequestPost } from "C:\\Users\\Emanuel\\OneDrive\\Área de Trabalho\\hd-system\\functions\\api\\admin\\create-user.ts"
import { onRequestPost as __api_admin_delete_organization_ts_onRequestPost } from "C:\\Users\\Emanuel\\OneDrive\\Área de Trabalho\\hd-system\\functions\\api\\admin\\delete-organization.ts"
import { onRequestPost as __api_admin_set_organization_active_ts_onRequestPost } from "C:\\Users\\Emanuel\\OneDrive\\Área de Trabalho\\hd-system\\functions\\api\\admin\\set-organization-active.ts"
import { onRequestPost as __api_admin_set_user_active_ts_onRequestPost } from "C:\\Users\\Emanuel\\OneDrive\\Área de Trabalho\\hd-system\\functions\\api\\admin\\set-user-active.ts"
import { onRequestGet as __api_health_ts_onRequestGet } from "C:\\Users\\Emanuel\\OneDrive\\Área de Trabalho\\hd-system\\functions\\api\\health.ts"
import { onRequest as ___middleware_ts_onRequest } from "C:\\Users\\Emanuel\\OneDrive\\Área de Trabalho\\hd-system\\functions\\_middleware.ts"

export const routes = [
    {
      routePath: "/api/admin/create-branch",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_create_branch_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/create-organization",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_create_organization_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/create-user",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_create_user_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/delete-organization",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_delete_organization_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/set-organization-active",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_set_organization_active_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/set-user-active",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_set_user_active_ts_onRequestPost],
    },
  {
      routePath: "/api/health",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_health_ts_onRequestGet],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_ts_onRequest],
      modules: [],
    },
  ]