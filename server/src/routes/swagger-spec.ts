/** OpenAPI 3.0 specification for the AMPM API. */
export const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "AMPM API",
    version: "1.0.0",
    description: "AI-Powered Media Processing API",
  },
  servers: [{ url: "/api", description: "API base path" }],
  components: {
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
        },
      },
      Job: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          createdAt: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["pending", "processing", "completed", "failed", "partially_completed"] },
          imageCount: { type: "integer" },
          images: { type: "array", items: { $ref: "#/components/schemas/Image" } },
        },
      },
      Image: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          originalName: { type: "string" },
          mimeType: { type: "string" },
          fileSize: { type: "integer" },
          status: { type: "string", enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] },
          retryCount: { type: "integer" },
          caption: { type: "string", nullable: true },
          labels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                score: { type: "number" },
              },
            },
            nullable: true,
          },
          safetyResult: {
            type: "object",
            properties: {
              isSafe: { type: "boolean" },
              categories: { type: "object" },
              flaggedCategory: { type: "string", nullable: true },
            },
            nullable: true,
          },
          isFlagged: { type: "boolean" },
          flaggedCategory: { type: "string", nullable: true },
          failureReason: { type: "string", nullable: true },
          failureMessage: { type: "string", nullable: true },
        },
      },
      Notification: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          message: { type: "string" },
          isRead: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  },
  paths: {
    "/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "User created", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "409": { description: "Email already exists", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Authenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } } },
          "401": { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } },
        },
        responses: {
          "200": { description: "New access token", content: { "application/json": { schema: { type: "object", properties: { accessToken: { type: "string" } } } } } },
          "401": { description: "Invalid refresh token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out and revoke all refresh tokens",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Logged out", content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" } } } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "User profile", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/jobs": {
      get: {
        tags: ["Jobs"],
        summary: "List all jobs",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Job list", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Job" } } } } },
        },
      },
      post: {
        tags: ["Jobs"],
        summary: "Create job with image uploads",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "multipart/form-data": { schema: { type: "object", properties: { images: { type: "array", items: { type: "string", format: "binary" } } } } } },
        },
        responses: {
          "201": { description: "Job created", content: { "application/json": { schema: { $ref: "#/components/schemas/Job" } } } },
          "400": { description: "No images or invalid file", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/jobs/{jobId}": {
      get: {
        tags: ["Jobs"],
        summary: "Get job detail",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Job detail", content: { "application/json": { schema: { $ref: "#/components/schemas/Job" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/jobs/{jobId}/images/{imageId}/retry": {
      post: {
        tags: ["Jobs"],
        summary: "Retry a failed image",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "imageId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Image re-queued", content: { "application/json": { schema: { $ref: "#/components/schemas/Image" } } } },
          "400": { description: "Image not in FAILED state", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/jobs/{jobId}/images/{imageId}/file": {
      get: {
        tags: ["Jobs"],
        summary: "Get image file for preview",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "imageId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Image binary", content: { "image/*": {} } },
          "404": { description: "Image not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "List notifications",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Notification list", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Notification" } } } } },
        },
      },
    },
    "/notifications/{notificationId}/read": {
      patch: {
        tags: ["Notifications"],
        summary: "Mark notification as read",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "notificationId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Notification" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/notifications/unread-count": {
      get: {
        tags: ["Notifications"],
        summary: "Get unread notification count",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Count", content: { "application/json": { schema: { type: "object", properties: { unreadCount: { type: "integer" } } } } } },
        },
      },
    },
  },
};
