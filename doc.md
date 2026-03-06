Build a Porter-Style Logistics Marketplace Platform

Use this document as the complete product + architecture specification to generate the full repository and implement the system step by step.

The goal is to build a logistics marketplace platform similar to Porter / Uber Freight that connects customers needing goods transportation with nearby drivers.

The system must support:

iOS app

Android app

backend APIs

dispatch engine

real-time driver tracking

admin dashboard

payments

insurance

GST e-way bill integration

Two-wheelers are excluded initially.

1 Product Overview

The platform connects customers who need goods transported with drivers who own vehicles.

Vehicles supported:

3 wheelers

mini trucks

trucks

Users should be able to:

book pickup

schedule delivery

track drivers

insure goods

generate GST e-way bill

pay digitally

Drivers should be able to:

accept trips

navigate to pickup

track earnings

get next job before finishing current job

2 User Roles
Customer

Capabilities:

create delivery booking

select vehicle type

track driver

insure goods

generate e-way bill

make payment

rate drivers

Driver

Capabilities:

go online/offline

receive jobs

navigate to pickup

start loading timer

complete trip

see earnings dashboard

accept queued next job

Admin

Capabilities:

approve drivers

verify documents

manage pricing rules

view analytics

resolve disputes

fraud monitoring

3 Core Features
Real-Time Driver Tracking

Drivers send GPS coordinates every 5 seconds.

Backend broadcasts location to customer app.

Driver Job Chaining

Drivers should receive next job before finishing current trip.

Purpose:

reduce idle time.

Formula:

driver_eta = current_trip_end + travel_time

Search for nearby bookings within 5-10 km radius.

Driver interface shows:

Current Job
Next Job (Queued)
Waiting Charge System

When driver reaches pickup location:

start loading timer.

If loading exceeds 20 minutes:

waiting_charge = extra_minutes * waiting_rate

Notify:

driver

customer

Driver Rating Pricing

Drivers with lower ratings can offer discounted price.

Example:

Rating	Price Multiplier
4.8+	1.00
4.5–4.8	0.97
4.0–4.5	0.92
<4.0	0.85

Customers can filter drivers by rating.

Insurance Module

Customer enters:

goods type

goods value

Offer:

basic coverage

premium coverage

high value coverage

Later integrate with insurance APIs.

GST / E-Way Bill Integration

Required inputs:

GSTIN
Invoice value
HSN code
Vehicle number

Integrate with:

GSTN API
EWayBill API

Store generated e-way bill with shipment.

4 Technology Stack
Mobile Apps

Use shared codebase.

React Native
TypeScript
Expo
React Navigation
Redux or Zustand
Google Maps SDK
Firebase Cloud Messaging
Backend
Node.js
NestJS framework
GraphQL or REST APIs
PostgreSQL
Redis
Docker
Real-Time Infrastructure
Socket.io
Redis Pub/Sub
Google Maps APIs
Cloud Infrastructure

Deploy on:

AWS or GCP

Use:

Kubernetes
Load balancers
auto scaling
object storage
CDN
5 High Level System Architecture
Customer App (React Native)
        |
        v
     API Gateway
        |
        v
+---------------------+
| Backend Services    |
+---------------------+
| Auth Service        |
| Trip Service        |
| Dispatch Engine     |
| Payment Service     |
| Notification Service|
+---------------------+
        |
        v
+---------------------+
| Data Layer          |
+---------------------+
| PostgreSQL          |
| Redis               |
| Location Store      |
+---------------------+
        |
        v
Driver App (React Native)
6 Geo-Spatial Driver Indexing

To find nearby drivers efficiently use geo indexing.

Example using Redis:

GEOADD drivers longitude latitude driver_id

Query nearby drivers:

GEORADIUS drivers pickup_long pickup_lat 5 km

Driver location update every 5 seconds.

7 Dispatch Algorithm (Uber Style)

Drivers scored based on:

distance_to_pickup
driver_rating
driver_idle_time
vehicle_type_match

Example score:

score =
(distance_weight * proximity)
+
(rating_weight * rating)
+
(idle_weight * idle_time)
+
(vehicle_weight * vehicle_match)

Driver with highest score gets job.

8 Database Schema
Users
users
id
name
phone
email
role
rating
created_at
Drivers
drivers
driver_id
vehicle_type
vehicle_number
license_number
verification_status
availability_status
current_lat
current_lng
Vehicles
vehicles
vehicle_id
driver_id
type
capacity
insurance_status
Orders
orders
order_id
customer_id
pickup_address
pickup_lat
pickup_lng
drop_address
drop_lat
drop_lng
vehicle_type
goods_description
goods_value
insurance_selected
eway_bill_number
status
price
created_at
Trips
trips
trip_id
order_id
driver_id
pickup_time
loading_start
loading_end
delivery_time
distance
duration
waiting_charge
Ratings
ratings
trip_id
driver_rating
customer_rating
review
9 API Contract Examples
Create Order
POST /api/orders

Request

{
pickup_location,
drop_location,
vehicle_type,
goods_description,
goods_value
}

Response

{
order_id,
estimated_price,
driver_assigned
}
Driver Location Update
POST /api/driver/location
{
driver_id,
latitude,
longitude,
timestamp
}
Fetch Nearby Drivers
GET /api/drivers/nearby?lat=&lng=&radius=
10 Mobile App Screens
Customer App

Home

Enter Pickup
Enter Drop
Select Vehicle
Show Price

Tracking

Live driver location
ETA
Call driver

Payment

UPI
Card
Wallet
Driver App

Dashboard

Online / Offline
Current Job
Next Job
Earnings

Trip flow

Accept job
Navigate to pickup
Start loading timer
Start trip
Complete delivery
11 Admin Dashboard

Build using:

Next.js
Tailwind
Chart.js

Features:

driver approvals

trip analytics

demand heatmaps

pricing rules

fraud detection

12 Payment Integration

Use:

Razorpay
Stripe
UPI
Wallets
13 Notifications

Use:

Firebase Cloud Messaging

Events:

driver assigned

driver arriving

waiting charge triggered

delivery completed

14 Safety Features

Driver verification:

Driving license
Vehicle RC
Aadhaar

Trip safety:

SOS button
trip logs
location history
15 Scaling to 100k Drivers

Use:

Redis GEO indexing

Kafka for dispatch events

microservices architecture

PostgreSQL read replicas

horizontal scaling with Kubernetes

caching layer for hot queries

16 Monetization

Revenue sources:

15-25% commission per trip
insurance markup
waiting charges
enterprise contracts
fuel partnerships
17 Development Roadmap
Phase 1 — MVP

booking

matching

tracking

payments

Phase 2

driver chaining

waiting charge automation

rating pricing

Phase 3

GST automation

insurance APIs

fuel partnerships

18 Instructions for Cursor

Follow these steps:

Generate full repository structure.

Implement backend services.

Create database migrations.

Implement mobile apps.

Add real-time tracking.

Build dispatch engine.

Integrate payments.

Build admin dashboard.

Add Docker deployment.

Final Note

Focus on:

driver utilization

fast dispatch

enterprise customers

pricing optimization