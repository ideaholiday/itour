/**
 * Universal Pagination & Query Sanitization Middleware
 */

export function paginate(defaultLimit = 20, maxLimit = 100) {
  return (req, res, next) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
    const offset = (page - 1) * limit;

    req.pagination = {
      page,
      limit,
      offset,
      formatResponse: (data, total) => {
        const totalPages = Math.ceil(total / limit) || 1;
        return {
          data,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
        };
      },
    };

    next();
  };
}

export default paginate;
