/**
 * OpenAPI / Swagger Specification Document
 */

export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Idea Holiday Marketplace API",
    version: "1.0.0",
    description: "Production API for Idea Holiday marketplace — Tours, Transfers, Packages, Suppliers, and Operations.",
    contact: {
      name: "Idea Holiday Engineering",
      email: "engineering@ideaholiday.in",
    },
  },
  servers: [
    {
      url: "/api/v1",
      description: "Version 1 API (Current)",
    },
    {
      url: "/api",
      description: "Standard API",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "API Health & Database Engine Status",
        responses: {
          200: {
            description: "Service is healthy",
          },
        },
      },
    },
    "/search": {
      get: {
        summary: "Search products and experiences",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "city", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "minPrice", in: "query", schema: { type: "integer" } },
          { name: "maxPrice", in: "query", schema: { type: "integer" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "Paginated product search results" },
        },
      },
    },
    "/search/suggestions": {
      get: {
        summary: "Autocomplete suggestions",
        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
        responses: { 200: { description: "Suggestions for destinations and products" } },
      },
    },
    "/uploads": {
      post: {
        summary: "Upload image or document via base64",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: { type: "string" },
                  filename: { type: "string" },
                  mimeType: { type: "string" },
                },
                required: ["data", "filename", "mimeType"],
              },
            },
          },
        },
        responses: { 201: { description: "File uploaded successfully" } },
      },
    },
    "/exports": {
      post: {
        summary: "Export dataset as CSV or JSON",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["bookings", "products", "payouts"] },
                  format: { type: "string", enum: ["csv", "json"] },
                },
                required: ["type"],
              },
            },
          },
        },
        responses: { 200: { description: "Dataset export generated" } },
      },
    },
  },
};

export default swaggerSpec;
