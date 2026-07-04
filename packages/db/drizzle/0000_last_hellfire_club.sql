CREATE TABLE "discord_channel_repo_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"provider" text NOT NULL,
	"namespace" text NOT NULL,
	"repo_name" text NOT NULL,
	"project_source_control_connection_id" text,
	"thread_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_installation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"guild_name" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_agent_config" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"mapping_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"target_branch" text DEFAULT 'main' NOT NULL,
	"tools" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"mapping_id" text,
	"project_source_control_connection_id" text,
	"connection_id" text,
	"provider" text NOT NULL,
	"namespace" text NOT NULL,
	"repo_name" text NOT NULL,
	"trigger" text NOT NULL,
	"delivery_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claimed_by" text,
	"runner_kind" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"result_markdown" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_agent_run_event" (
	"id" text PRIMARY KEY NOT NULL,
	"linear_agent_run_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_agent_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"mapping_id" text,
	"linear_agent_session_id" text NOT NULL,
	"linear_issue_id" text,
	"issue_identifier" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_installation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"workspace_name" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp,
	"webhook_id" text,
	"webhook_secret_encrypted" text,
	"granted_scopes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linear_project_repo_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"project_id" text NOT NULL,
	"project_name" text NOT NULL,
	"provider" text NOT NULL,
	"namespace" text NOT NULL,
	"repo_name" text NOT NULL,
	"project_source_control_connection_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"inviter_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"invite_code" text NOT NULL,
	"logo" text,
	"metadata" text,
	"cloud_workers_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organization_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "organization_secret" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slot" text NOT NULL,
	"value_encrypted" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_control_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"external_org_id" text NOT NULL,
	"display_name" text NOT NULL,
	"credentials_encrypted" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_control_repo" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"external_repo_id" text NOT NULL,
	"namespace" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_source_control_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"provider" text NOT NULL,
	"namespace" text NOT NULL,
	"name" text NOT NULL,
	"external_repo_id" text NOT NULL,
	"remote_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_environment_variable" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_source_control_connection_id" text NOT NULL,
	"key" text NOT NULL,
	"value_encrypted" text NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"description" text,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runner_repo_binding" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"runner_instance_id" text NOT NULL,
	"project_source_control_connection_id" text NOT NULL,
	"project_path" text NOT NULL,
	"label" text,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_source_control_connection_id" text NOT NULL,
	"name" text DEFAULT 'Untitled' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"target_branch" text DEFAULT '' NOT NULL,
	"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tools" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legacy_workflow_type" text,
	"local_only" boolean DEFAULT false NOT NULL,
	"execution_target" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_source_control_connection_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"project_path" text,
	"provider" text NOT NULL,
	"namespace" text NOT NULL,
	"repo_name" text NOT NULL,
	"pr_number" integer NOT NULL,
	"workflow_id" text,
	"workflow_type" text,
	"event" text NOT NULL,
	"delivery_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claimed_by" text,
	"iteration" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"error_message" text,
	"result_markdown" text,
	"result_payload" jsonb,
	"resolved_executor" text DEFAULT 'local' NOT NULL,
	"runner_kind" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run_event" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_source_control_connection_id" text NOT NULL,
	"workflow_type" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams_channel_repo_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"team_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"provider" text NOT NULL,
	"namespace" text NOT NULL,
	"repo_name" text NOT NULL,
	"project_source_control_connection_id" text,
	"conversation_id" text,
	"service_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams_installation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp,
	"service_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_channel_repo_mapping" ADD CONSTRAINT "discord_channel_repo_mapping_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channel_repo_mapping" ADD CONSTRAINT "discord_channel_repo_mapping_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channel_repo_mapping" ADD CONSTRAINT "discord_channel_repo_mapping_installation_id_discord_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."discord_installation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channel_repo_mapping" ADD CONSTRAINT "discord_channel_repo_mapping_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_installation" ADD CONSTRAINT "discord_installation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_installation" ADD CONSTRAINT "discord_installation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_config" ADD CONSTRAINT "linear_agent_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_config" ADD CONSTRAINT "linear_agent_config_mapping_id_linear_project_repo_mapping_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."linear_project_repo_mapping"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_run" ADD CONSTRAINT "linear_agent_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_run" ADD CONSTRAINT "linear_agent_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_run" ADD CONSTRAINT "linear_agent_run_session_id_linear_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."linear_agent_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_run" ADD CONSTRAINT "linear_agent_run_mapping_id_linear_project_repo_mapping_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."linear_project_repo_mapping"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_run" ADD CONSTRAINT "linear_agent_run_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_run" ADD CONSTRAINT "linear_agent_run_connection_id_source_control_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."source_control_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_run_event" ADD CONSTRAINT "linear_agent_run_event_linear_agent_run_id_linear_agent_run_id_fk" FOREIGN KEY ("linear_agent_run_id") REFERENCES "public"."linear_agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_run_event" ADD CONSTRAINT "linear_agent_run_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_session" ADD CONSTRAINT "linear_agent_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_session" ADD CONSTRAINT "linear_agent_session_mapping_id_linear_project_repo_mapping_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."linear_project_repo_mapping"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_installation" ADD CONSTRAINT "linear_installation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_installation" ADD CONSTRAINT "linear_installation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_project_repo_mapping" ADD CONSTRAINT "linear_project_repo_mapping_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_project_repo_mapping" ADD CONSTRAINT "linear_project_repo_mapping_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_project_repo_mapping" ADD CONSTRAINT "linear_project_repo_mapping_installation_id_linear_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."linear_installation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_project_repo_mapping" ADD CONSTRAINT "linear_project_repo_mapping_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_secret" ADD CONSTRAINT "organization_secret_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_secret" ADD CONSTRAINT "organization_secret_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_control_connection" ADD CONSTRAINT "source_control_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_control_connection" ADD CONSTRAINT "source_control_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_control_repo" ADD CONSTRAINT "source_control_repo_connection_id_source_control_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."source_control_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_source_control_connection" ADD CONSTRAINT "project_source_control_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_source_control_connection" ADD CONSTRAINT "project_source_control_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_source_control_connection" ADD CONSTRAINT "project_source_control_connection_connection_id_source_control_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."source_control_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_environment_variable" ADD CONSTRAINT "repo_environment_variable_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_environment_variable" ADD CONSTRAINT "repo_environment_variable_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_environment_variable" ADD CONSTRAINT "repo_environment_variable_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_repo_binding" ADD CONSTRAINT "runner_repo_binding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_repo_binding" ADD CONSTRAINT "runner_repo_binding_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_repo_binding" ADD CONSTRAINT "runner_repo_binding_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_connection_id_source_control_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."source_control_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_event" ADD CONSTRAINT "workflow_run_event_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_event" ADD CONSTRAINT "workflow_run_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_setting" ADD CONSTRAINT "workflow_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_setting" ADD CONSTRAINT "workflow_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_setting" ADD CONSTRAINT "workflow_setting_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_channel_repo_mapping" ADD CONSTRAINT "teams_channel_repo_mapping_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_channel_repo_mapping" ADD CONSTRAINT "teams_channel_repo_mapping_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_channel_repo_mapping" ADD CONSTRAINT "teams_channel_repo_mapping_installation_id_teams_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."teams_installation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_channel_repo_mapping" ADD CONSTRAINT "teams_channel_repo_mapping_project_source_control_connection_id_project_source_control_connection_id_fk" FOREIGN KEY ("project_source_control_connection_id") REFERENCES "public"."project_source_control_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_installation" ADD CONSTRAINT "teams_installation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_installation" ADD CONSTRAINT "teams_installation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discord_channel_repo_mapping_org_repo_idx" ON "discord_channel_repo_mapping" USING btree ("organization_id","provider","namespace","repo_name");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_channel_repo_mapping_org_channel_idx" ON "discord_channel_repo_mapping" USING btree ("organization_id","channel_id");--> statement-breakpoint
CREATE INDEX "discord_channel_repo_mapping_channelId_idx" ON "discord_channel_repo_mapping" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "discord_channel_repo_mapping_installationId_idx" ON "discord_channel_repo_mapping" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "discord_channel_repo_mapping_organizationId_idx" ON "discord_channel_repo_mapping" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_installation_org_guild_idx" ON "discord_installation" USING btree ("organization_id","guild_id");--> statement-breakpoint
CREATE INDEX "discord_installation_organizationId_idx" ON "discord_installation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "discord_installation_userId_idx" ON "discord_installation" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_agent_config_mapping_idx" ON "linear_agent_config" USING btree ("mapping_id");--> statement-breakpoint
CREATE INDEX "linear_agent_config_organizationId_idx" ON "linear_agent_config" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_agent_run_deliveryId_idx" ON "linear_agent_run" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "linear_agent_run_org_status_idx" ON "linear_agent_run" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "linear_agent_run_sessionId_idx" ON "linear_agent_run" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_agent_run_event_run_seq_idx" ON "linear_agent_run_event" USING btree ("linear_agent_run_id","seq");--> statement-breakpoint
CREATE INDEX "linear_agent_run_event_organizationId_idx" ON "linear_agent_run_event" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_agent_session_linear_id_idx" ON "linear_agent_session" USING btree ("linear_agent_session_id");--> statement-breakpoint
CREATE INDEX "linear_agent_session_organizationId_idx" ON "linear_agent_session" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_installation_org_workspace_idx" ON "linear_installation" USING btree ("organization_id","workspace_id");--> statement-breakpoint
CREATE INDEX "linear_installation_organizationId_idx" ON "linear_installation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "linear_installation_userId_idx" ON "linear_installation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "linear_installation_webhookId_idx" ON "linear_installation" USING btree ("webhook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_project_repo_mapping_org_repo_idx" ON "linear_project_repo_mapping" USING btree ("organization_id","provider","namespace","repo_name");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_project_repo_mapping_org_project_idx" ON "linear_project_repo_mapping" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "linear_project_repo_mapping_projectId_idx" ON "linear_project_repo_mapping" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "linear_project_repo_mapping_installationId_idx" ON "linear_project_repo_mapping" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "linear_project_repo_mapping_organizationId_idx" ON "linear_project_repo_mapping" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "member_userId_unique_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_slug_idx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_secret_org_slot_idx" ON "organization_secret" USING btree ("organization_id","slot");--> statement-breakpoint
CREATE INDEX "organization_secret_organizationId_idx" ON "organization_secret" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "source_control_connection_provider_org_external_idx" ON "source_control_connection" USING btree ("provider","organization_id","external_org_id");--> statement-breakpoint
CREATE INDEX "source_control_connection_organizationId_idx" ON "source_control_connection" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "source_control_connection_userId_idx" ON "source_control_connection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_control_connection_provider_idx" ON "source_control_connection" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "source_control_repo_connection_external_idx" ON "source_control_repo" USING btree ("connection_id","external_repo_id");--> statement-breakpoint
CREATE INDEX "source_control_repo_connectionId_idx" ON "source_control_repo" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "source_control_repo_namespace_name_idx" ON "source_control_repo" USING btree ("namespace","name");--> statement-breakpoint
CREATE UNIQUE INDEX "project_source_control_connection_org_repo_idx" ON "project_source_control_connection" USING btree ("organization_id","connection_id","namespace","name");--> statement-breakpoint
CREATE INDEX "project_source_control_connection_organizationId_idx" ON "project_source_control_connection" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_source_control_connection_userId_idx" ON "project_source_control_connection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_source_control_connection_connectionId_idx" ON "project_source_control_connection" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "project_source_control_connection_repo_idx" ON "project_source_control_connection" USING btree ("provider","namespace","name");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_environment_variable_connection_key_idx" ON "repo_environment_variable" USING btree ("project_source_control_connection_id","key");--> statement-breakpoint
CREATE INDEX "repo_environment_variable_organizationId_idx" ON "repo_environment_variable" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "repo_environment_variable_connectionId_idx" ON "repo_environment_variable" USING btree ("project_source_control_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runner_repo_binding_runner_connection_idx" ON "runner_repo_binding" USING btree ("runner_instance_id","project_source_control_connection_id");--> statement-breakpoint
CREATE INDEX "runner_repo_binding_organizationId_idx" ON "runner_repo_binding" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "runner_repo_binding_userId_idx" ON "runner_repo_binding" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "runner_repo_binding_connectionId_idx" ON "runner_repo_binding" USING btree ("project_source_control_connection_id");--> statement-breakpoint
CREATE INDEX "runner_repo_binding_runnerInstanceId_idx" ON "runner_repo_binding" USING btree ("runner_instance_id");--> statement-breakpoint
CREATE INDEX "workflow_organizationId_idx" ON "workflow" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_userId_idx" ON "workflow" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workflow_connectionId_idx" ON "workflow" USING btree ("project_source_control_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_deliveryId_idx" ON "workflow_run" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "workflow_run_org_status_idx" ON "workflow_run" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "workflow_run_org_status_executor_idx" ON "workflow_run" USING btree ("organization_id","status","resolved_executor");--> statement-breakpoint
CREATE INDEX "workflow_run_user_status_idx" ON "workflow_run" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "workflow_run_pr_idx" ON "workflow_run" USING btree ("provider","namespace","repo_name","pr_number","workflow_type");--> statement-breakpoint
CREATE INDEX "workflow_run_workflowId_idx" ON "workflow_run" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_event_run_seq_idx" ON "workflow_run_event" USING btree ("workflow_run_id","seq");--> statement-breakpoint
CREATE INDEX "workflow_run_event_organizationId_idx" ON "workflow_run_event" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_setting_connection_type_idx" ON "workflow_setting" USING btree ("project_source_control_connection_id","workflow_type");--> statement-breakpoint
CREATE INDEX "workflow_setting_organizationId_idx" ON "workflow_setting" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_setting_userId_idx" ON "workflow_setting" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_channel_repo_mapping_org_repo_idx" ON "teams_channel_repo_mapping" USING btree ("organization_id","provider","namespace","repo_name");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_channel_repo_mapping_org_channel_idx" ON "teams_channel_repo_mapping" USING btree ("organization_id","channel_id");--> statement-breakpoint
CREATE INDEX "teams_channel_repo_mapping_channelId_idx" ON "teams_channel_repo_mapping" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "teams_channel_repo_mapping_installationId_idx" ON "teams_channel_repo_mapping" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "teams_channel_repo_mapping_organizationId_idx" ON "teams_channel_repo_mapping" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_installation_org_team_idx" ON "teams_installation" USING btree ("organization_id","team_id");--> statement-breakpoint
CREATE INDEX "teams_installation_organizationId_idx" ON "teams_installation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teams_installation_userId_idx" ON "teams_installation" USING btree ("user_id");