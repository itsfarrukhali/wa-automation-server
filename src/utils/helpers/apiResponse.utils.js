// utils/apiResponse.js

class ApiResponseUtil {
  static success(res, data, message = "Success", statusCode = 200) {
    const response = {
      success: true,
      message,
      data,
    };
    return res.status(statusCode).json(response);
  }

  static error(
    res,
    message = "An error occurred",
    statusCode = 500,
    error = null,
  ) {
    const response = {
      success: false,
      message,
      ...(error && { error }),
    };
    return res.status(statusCode).json(response);
  }

  static created(res, data, message = "Resource created successfully") {
    return this.success(res, data, message, 201);
  }

  static noContent(res) {
    return res.status(204).send();
  }

  static badRequest(res, message = "Bad request", error = null) {
    return this.error(res, message, 400, error);
  }

  static unauthorized(res, message = "Unauthorized") {
    return this.error(res, message, 401);
  }

  static forbidden(res, message = "Forbidden") {
    return this.error(res, message, 403);
  }

  static notFound(res, message = "Resource not found") {
    return this.error(res, message, 404);
  }

  static conflict(res, message = "Resource already exists") {
    return this.error(res, message, 409);
  }

  static serverError(res, message = "Internal server error", error = null) {
    return this.error(res, message, 500, error);
  }
}

export default ApiResponseUtil;
