import mongoose from "mongoose";
import Booking from "../models/booking.model.js";
import Campaign from "../models/campaign.model.js";
import Customer from "../models/customer.model.js";
import MessageLog from "../models/messagelog.model.js";
import { getMyBusiness } from "./business.service.js";

const parseDateRange = ({ dateFrom, dateTo, days = 30 } = {}) => {
  const end = dateTo ? new Date(dateTo) : new Date();
  const start = dateFrom
    ? new Date(dateFrom)
    : new Date(end.getTime() - Number(days) * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const objectId = (id) => new mongoose.Types.ObjectId(id);

const safeRate = (part, total) => (total > 0 ? (part / total) * 100 : 0);

export const getOverviewReport = async (userId, query = {}) => {
  const business = await getMyBusiness(userId);
  const { start, end } = parseDateRange(query);
  const businessId = objectId(business._id);

  const [
    bookingStats,
    customerStats,
    messageStats,
    campaignStats,
    upcomingBookings,
  ] = await Promise.all([
    Booking.aggregate([
      {
        $match: {
          businessId,
          scheduledAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          noShow: { $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] } },
          revenue: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, "$amountPaid", 0],
            },
          },
          bookedValue: { $sum: "$totalAmount" },
        },
      },
    ]),
    Customer.aggregate([
      {
        $match: {
          businessId,
          status: { $ne: "deleted" },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          optedIn: { $sum: { $cond: ["$whatsappOptIn", 1, 0] } },
          optedOut: { $sum: { $cond: ["$optedOut", 1, 0] } },
          avgEngagement: { $avg: "$engagement.score" },
        },
      },
    ]),
    MessageLog.aggregate([
      {
        $match: {
          businessId,
          sentAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
    Campaign.aggregate([
      {
        $match: {
          businessId,
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: { $sum: "$metrics.sent" },
          failed: { $sum: "$metrics.failed" },
          read: { $sum: "$metrics.read" },
        },
      },
    ]),
    Booking.countDocuments({
      businessId: business._id,
      scheduledAt: { $gt: new Date() },
      status: { $in: ["pending", "confirmed", "arrived", "in_progress"] },
    }),
  ]);

  const bookings = bookingStats[0] || {};
  const customers = customerStats[0] || {};
  const campaigns = campaignStats[0] || {};
  const messagesByStatus = messageStats.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const totalMessages = Object.values(messagesByStatus).reduce(
    (sum, count) => sum + count,
    0,
  );

  return {
    range: { start, end },
    bookings: {
      total: bookings.total || 0,
      completed: bookings.completed || 0,
      cancelled: bookings.cancelled || 0,
      noShow: bookings.noShow || 0,
      upcoming: upcomingBookings,
      completionRate: safeRate(bookings.completed || 0, bookings.total || 0),
    },
    revenue: {
      collected: bookings.revenue || 0,
      bookedValue: bookings.bookedValue || 0,
    },
    customers: {
      total: customers.total || 0,
      optedIn: customers.optedIn || 0,
      optedOut: customers.optedOut || 0,
      optInRate: safeRate(customers.optedIn || 0, customers.total || 0),
      avgEngagement: customers.avgEngagement || 0,
    },
    messages: {
      total: totalMessages,
      byStatus: messagesByStatus,
      deliveryRate: safeRate(
        (messagesByStatus.delivered || 0) + (messagesByStatus.read || 0),
        totalMessages,
      ),
      readRate: safeRate(messagesByStatus.read || 0, totalMessages),
      failureRate: safeRate(messagesByStatus.failed || 0, totalMessages),
    },
    campaigns: {
      total: campaigns.total || 0,
      sent: campaigns.sent || 0,
      failed: campaigns.failed || 0,
      read: campaigns.read || 0,
      readRate: safeRate(campaigns.read || 0, campaigns.sent || 0),
    },
  };
};

export const getRevenueReport = async (userId, query = {}) => {
  const business = await getMyBusiness(userId);
  const { start, end } = parseDateRange(query);

  const daily = await Booking.aggregate([
    {
      $match: {
        businessId: objectId(business._id),
        scheduledAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$scheduledAt" },
        },
        collected: { $sum: "$amountPaid" },
        bookedValue: { $sum: "$totalAmount" },
        completedRevenue: {
          $sum: {
            $cond: [{ $eq: ["$status", "completed"] }, "$amountPaid", 0],
          },
        },
        bookings: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    range: { start, end },
    totals: daily.reduce(
      (acc, item) => {
        acc.collected += item.collected;
        acc.bookedValue += item.bookedValue;
        acc.completedRevenue += item.completedRevenue;
        acc.bookings += item.bookings;
        return acc;
      },
      { collected: 0, bookedValue: 0, completedRevenue: 0, bookings: 0 },
    ),
    daily: daily.map((item) => ({
      date: item._id,
      collected: item.collected,
      bookedValue: item.bookedValue,
      completedRevenue: item.completedRevenue,
      bookings: item.bookings,
    })),
  };
};

export const getBookingReport = async (userId, query = {}) => {
  const business = await getMyBusiness(userId);
  const { start, end } = parseDateRange(query);

  const byStatus = await Booking.aggregate([
    {
      $match: {
        businessId: objectId(business._id),
        scheduledAt: { $gte: start, $lte: end },
      },
    },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const byService = await Booking.aggregate([
    {
      $match: {
        businessId: objectId(business._id),
        scheduledAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: "$serviceDetails.name",
        bookings: { $sum: 1 },
        revenue: { $sum: "$amountPaid" },
      },
    },
    { $sort: { bookings: -1 } },
    { $limit: 10 },
  ]);

  return {
    range: { start, end },
    byStatus: byStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    topServices: byService.map((item) => ({
      service: item._id,
      bookings: item.bookings,
      revenue: item.revenue,
    })),
  };
};

export const getCustomerReport = async (userId) => {
  const business = await getMyBusiness(userId);

  const [segments, topCustomers] = await Promise.all([
    Customer.aggregate([
      {
        $match: {
          businessId: objectId(business._id),
          status: { $ne: "deleted" },
          deletedAt: null,
        },
      },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Customer.find({
      businessId: business._id,
      status: { $ne: "deleted" },
      deletedAt: null,
    })
      .sort({ totalSpent: -1, totalVisits: -1 })
      .limit(10)
      .select("name phone whatsappNumber totalSpent totalVisits tags engagement.score"),
  ]);

  return {
    segments: segments.map((item) => ({
      tag: item._id,
      count: item.count,
    })),
    topCustomers,
  };
};
