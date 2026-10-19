import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── Permission constants (inline to avoid circular workspace dep in seed) ───

const ALL_PERMISSIONS = [
  'products.view', 'products.create', 'products.edit', 'products.delete', 'products.import', 'products.export',
  'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.count', 'inventory.view_cost',
  'purchasing.view', 'purchasing.create', 'purchasing.approve', 'purchasing.receive', 'purchasing.manage_suppliers',
  'sales.view', 'sales.create', 'sales.edit', 'sales.cancel', 'sales.refund', 'sales.view_cost', 'sales.apply_discount',
  'pos.access', 'pos.open_session', 'pos.close_session', 'pos.manage_float',
  'customers.view', 'customers.create', 'customers.edit', 'customers.delete', 'customers.export',
  'finance.view', 'finance.manage', 'finance.bank_accounts', 'finance.expenses.view', 'finance.expenses.create', 'finance.expenses.approve',
  'finance.manage_accounts', 'finance.view_reports', 'finance.manage_expenses', 'finance.approve_expenses', 'finance.manage_payroll',
  'staff.view', 'staff.create', 'staff.edit', 'staff.manage_attendance', 'staff.view_salaries',
  'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.assign', 'tasks.delete',
  'goals.view', 'goals.create', 'goals.edit', 'goals.delete',
  'reports.view', 'reports.export', 'reports.finance', 'reports.inventory', 'reports.sales', 'reports.staff',
  'ai.access', 'ai.manage_providers', 'ai.view_usage', 'ai.manage_budget',
  'settings.view', 'settings.edit', 'settings.manage_integrations',
  'admin.manage_users', 'admin.manage_roles', 'admin.manage_feature_flags', 'admin.view_audit', 'admin.manage_locations', 'admin.manage_departments',
  'automation.view', 'automation.create', 'automation.edit', 'automation.delete', 'automation.activate', 'automation.execute', 'automation.history.view',
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  MANAGING_DIRECTOR: ALL_PERMISSIONS.filter(p => !p.startsWith('admin.')).concat(['admin.view_audit', 'admin.manage_locations']),
  GENERAL_MANAGER: [
    'products.view', 'products.create', 'products.edit', 'products.export',
    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.count', 'inventory.view_cost',
    'purchasing.view', 'purchasing.create', 'purchasing.approve', 'purchasing.receive', 'purchasing.manage_suppliers',
    'sales.view', 'sales.create', 'sales.edit', 'sales.cancel', 'sales.refund', 'sales.view_cost', 'sales.apply_discount',
    'customers.view', 'customers.create', 'customers.edit', 'customers.export',
    'finance.view', 'finance.expenses.view', 'finance.expenses.approve', 'finance.view_reports', 'finance.manage_expenses', 'finance.approve_expenses',
    'staff.view', 'staff.create', 'staff.edit', 'staff.manage_attendance',
    'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.assign',
    'goals.view', 'goals.create', 'goals.edit',
    'reports.view', 'reports.export', 'reports.finance', 'reports.inventory', 'reports.sales', 'reports.staff',
    'ai.access', 'ai.view_usage',
    'settings.view', 'admin.view_audit',
    'automation.view', 'automation.create', 'automation.edit', 'automation.activate', 'automation.execute', 'automation.history.view',
  ],
  SALES_MANAGER: [
    'products.view', 'products.export',
    'inventory.view', 'inventory.view_cost',
    'sales.view', 'sales.create', 'sales.edit', 'sales.cancel', 'sales.refund', 'sales.apply_discount',
    'pos.access', 'pos.open_session', 'pos.close_session', 'pos.manage_float',
    'customers.view', 'customers.create', 'customers.edit', 'customers.export',
    'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.assign',
    'goals.view', 'goals.create', 'goals.edit',
    'reports.view', 'reports.sales',
    'ai.access',
    'automation.view', 'automation.history.view',
  ],
  SALES_STAFF: [
    'products.view',
    'inventory.view',
    'sales.view', 'sales.create', 'sales.edit',
    'pos.access', 'pos.open_session', 'pos.close_session',
    'customers.view', 'customers.create', 'customers.edit',
    'tasks.view', 'tasks.create',
  ],
  INVENTORY_MANAGER: [
    'products.view', 'products.create', 'products.edit', 'products.import', 'products.export',
    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.count', 'inventory.view_cost',
    'purchasing.view', 'purchasing.create', 'purchasing.receive',
    'reports.view', 'reports.inventory',
    'tasks.view', 'tasks.create',
  ],
  WAREHOUSE_STAFF: [
    'products.view',
    'inventory.view', 'inventory.transfer', 'inventory.count',
    'purchasing.receive',
    'tasks.view',
  ],
  ACCOUNTANT: [
    'sales.view', 'sales.view_cost',
    'purchasing.view',
    'finance.view', 'finance.manage', 'finance.bank_accounts', 'finance.expenses.view', 'finance.expenses.create', 'finance.expenses.approve',
    'finance.manage_accounts', 'finance.view_reports', 'finance.manage_expenses', 'finance.approve_expenses',
    'reports.view', 'reports.export', 'reports.finance', 'reports.sales',
    'settings.view',
  ],
  HR_ADMIN: [
    'staff.view', 'staff.create', 'staff.edit', 'staff.manage_attendance', 'staff.view_salaries',
    'tasks.view', 'tasks.create', 'tasks.assign',
    'finance.manage_payroll',
    'reports.view', 'reports.staff',
    'admin.manage_users',
  ],
  ECOMMERCE_MANAGER: [
    'products.view', 'products.create', 'products.edit', 'products.export',
    'inventory.view',
    'sales.view', 'sales.create', 'sales.edit',
    'customers.view', 'customers.create', 'customers.edit', 'customers.export',
    'tasks.view', 'tasks.create',
    'settings.view', 'settings.manage_integrations',
    'ai.access',
  ],
  CUSTOMER_SERVICE: [
    'products.view',
    'inventory.view',
    'sales.view', 'sales.create',
    'customers.view', 'customers.create', 'customers.edit',
    'tasks.view', 'tasks.create',
  ],
  AUDITOR: [
    'products.view', 'products.export',
    'inventory.view', 'inventory.view_cost',
    'sales.view', 'sales.view_cost',
    'purchasing.view',
    'finance.view', 'finance.view_reports',
    'reports.view', 'reports.export', 'reports.finance', 'reports.inventory', 'reports.sales', 'reports.staff',
    'admin.view_audit',
  ],
};

const FEATURE_FLAGS = [
  { key: 'FEATURE_AI_ASSISTANT', name: 'AI Assistant', description: 'Enable the AI-powered business assistant' },
  { key: 'FEATURE_BANK_INTEGRATION', name: 'Bank Integration', description: 'Enable bank statement reconciliation via Mono/Okra' },
  { key: 'FEATURE_MARKETPLACE_SYNC', name: 'Marketplace Sync', description: 'Sync products and orders with online marketplaces' },
  { key: 'FEATURE_EMAIL_MARKETING', name: 'Email Marketing', description: 'Enable email campaign management' },
  { key: 'FEATURE_TELEGRAM', name: 'Telegram Notifications', description: 'Send business alerts via Telegram bot' },
  { key: 'FEATURE_CALENDAR', name: 'Calendar Integration', description: 'Sync with Google/Outlook calendar' },
  { key: 'FEATURE_MULTI_LOCATION', name: 'Multi-Location', description: 'Enable multi-location inventory and reporting' },
  { key: 'FEATURE_ECOMMERCE_API', name: 'E-commerce API', description: 'Expose public API for storefront integration' },
];

const BUSINESS_RULE_SETTINGS = [
  { key: 'rules.sales.max_discount_percent', value: '20', type: 'number', group: 'rules', label: 'Max Discount Percentage', description: 'Maximum discount % allowed on a sales order without manager approval', isPublic: false },
  { key: 'rules.sales.min_margin_percent', value: '10', type: 'number', group: 'rules', label: 'Minimum Margin Percentage', description: 'Minimum gross margin % required on a sales order', isPublic: false },
  { key: 'rules.sales.refund_approval_threshold_ngn', value: '50000', type: 'number', group: 'rules', label: 'Refund Approval Threshold (NGN)', description: 'Refunds above this amount require explicit approval', isPublic: false },
  { key: 'rules.purchasing.approval_threshold_ngn', value: '500000', type: 'number', group: 'rules', label: 'PO Approval Threshold (NGN)', description: 'Purchase orders above this amount are flagged for elevated review', isPublic: false },
  { key: 'rules.expense.approval_threshold_ngn', value: '100000', type: 'number', group: 'rules', label: 'Expense Approval Threshold (NGN)', description: 'Expenses above this amount require explicit approval', isPublic: false },
];

const DEFAULT_SETTINGS = [
  { key: 'company_name', value: 'KNEF Gadgets', type: 'string', group: 'general', label: 'Company Name', isPublic: true },
  { key: 'company_email', value: '', type: 'string', group: 'general', label: 'Company Email', isPublic: true },
  { key: 'company_phone', value: '', type: 'string', group: 'general', label: 'Company Phone', isPublic: true },
  { key: 'company_address', value: 'Lagos, Nigeria', type: 'string', group: 'general', label: 'Company Address', isPublic: true },
  { key: 'currency', value: 'NGN', type: 'string', group: 'general', label: 'Default Currency', isPublic: true },
  { key: 'timezone', value: 'Africa/Lagos', type: 'string', group: 'general', label: 'Timezone', isPublic: true },
  { key: 'date_format', value: 'DD/MM/YYYY', type: 'string', group: 'general', label: 'Date Format', isPublic: true },
  { key: 'invoice_prefix', value: 'INV', type: 'string', group: 'documents', label: 'Invoice Prefix' },
  { key: 'invoice_next_number', value: '1', type: 'number', group: 'documents', label: 'Invoice Next Number' },
  { key: 'receipt_prefix', value: 'RCT', type: 'string', group: 'documents', label: 'Receipt Prefix' },
  { key: 'receipt_next_number', value: '1', type: 'number', group: 'documents', label: 'Receipt Next Number' },
  { key: 'po_prefix', value: 'PO', type: 'string', group: 'documents', label: 'Purchase Order Prefix' },
  { key: 'po_next_number', value: '1', type: 'number', group: 'documents', label: 'PO Next Number' },
  { key: 'order_prefix', value: 'ORD', type: 'string', group: 'documents', label: 'Sales Order Prefix' },
  { key: 'order_next_number', value: '1', type: 'number', group: 'documents', label: 'Order Next Number' },
  { key: 'low_stock_threshold', value: '5', type: 'number', group: 'inventory', label: 'Default Low Stock Threshold' },
  { key: 'tax_rate', value: '7.5', type: 'number', group: 'finance', label: 'Default VAT Rate (%)' },
  { key: 'allow_negative_inventory', value: 'false', type: 'boolean', group: 'inventory', label: 'Allow Negative Inventory' },
  { key: 'invoice_footer', value: 'Thank you for your business!', type: 'string', group: 'documents', label: 'Invoice Footer' },
  { key: 'receipt_footer', value: 'Thank you! Items sold are not returnable after 7 days.', type: 'string', group: 'documents', label: 'Receipt Footer' },
];

async function seed(): Promise<void> {
  console.log('🌱 Starting database seed...\n');

  // ── 1. Create or find the default organization ──────────────────────────────
  let org = await prisma.organization.findFirst({
    where: { slug: 'knef-gadgets' },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: createId(),
        name: 'KNEF Gadgets',
        slug: 'knef-gadgets',
        email: 'admin@knefgadgets.com',
        phone: '+234-000-000-0000',
        address: '123 Computer Village',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
      },
    });
    console.log('✅ Organization created:', org.name);
  } else {
    console.log('ℹ️  Organization already exists:', org.name);
  }

  // ── 2. Create default location ──────────────────────────────────────────────
  let defaultLocation = await prisma.location.findFirst({
    where: { organizationId: org.id, code: 'MAIN' },
  });

  if (!defaultLocation) {
    defaultLocation = await prisma.location.create({
      data: {
        id: createId(),
        organizationId: org.id,
        name: 'Main Store',
        code: 'MAIN',
        address: '123 Computer Village',
        city: 'Lagos',
        state: 'Lagos',
        isWarehouse: false,
        isActive: true,
      },
    });
    console.log('✅ Default location created:', defaultLocation.name);
  }

  // ── 3. Create system roles ──────────────────────────────────────────────────
  const roleNames = Object.keys(ROLE_PERMISSIONS);
  const roleMap: Record<string, string> = {};

  for (const roleName of roleNames) {
    const existing = await prisma.role.findFirst({
      where: { organizationId: org.id, name: roleName },
    });

    let role;
    if (!existing) {
      role = await prisma.role.create({
        data: {
          id: createId(),
          organizationId: org.id,
          name: roleName,
          description: getRoleDescription(roleName),
          isSystem: true,
        },
      });
      console.log(`✅ Role created: ${roleName}`);
    } else {
      role = existing;
      console.log(`ℹ️  Role already exists: ${roleName}`);
    }

    roleMap[roleName] = role.id;

    // Upsert permissions for this role
    const perms = ROLE_PERMISSIONS[roleName];
    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permission: {
            roleId: role.id,
            permission: perm,
          },
        },
        create: {
          id: createId(),
          roleId: role.id,
          permission: perm,
        },
        update: {},
      });
    }
  }
  console.log('✅ Role permissions assigned\n');

  // ── 4. Create feature flags ─────────────────────────────────────────────────
  for (const flag of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: {
        organizationId_key: {
          organizationId: org.id,
          key: flag.key,
        },
      },
      create: {
        id: createId(),
        organizationId: org.id,
        key: flag.key,
        name: flag.name,
        description: flag.description,
        isEnabled: false,
        rolloutPercent: 0,
      },
      update: {
        name: flag.name,
        description: flag.description,
      },
    });
  }
  console.log('✅ Feature flags created\n');

  // ── 5. Create system settings ───────────────────────────────────────────────
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: {
        organizationId_key: {
          organizationId: org.id,
          key: setting.key,
        },
      },
      create: {
        id: createId(),
        organizationId: org.id,
        key: setting.key,
        value: setting.value,
        type: setting.type,
        group: setting.group,
        label: setting.label,
        isPublic: setting.isPublic ?? false,
      },
      update: {
        label: setting.label,
        type: setting.type,
        group: setting.group,
      },
    });
  }
  console.log('✅ System settings created\n');

  // ── 5b. Business rule settings ─────────────────────────────────────────────
  for (const setting of BUSINESS_RULE_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: {
        organizationId_key: {
          organizationId: org.id,
          key: setting.key,
        },
      },
      create: {
        id: createId(),
        organizationId: org.id,
        key: setting.key,
        value: setting.value,
        type: setting.type,
        group: setting.group,
        label: setting.label,
        description: setting.description,
        isPublic: false,
      },
      update: {
        label: setting.label,
        description: setting.description,
        type: setting.type,
        group: setting.group,
      },
    });
  }
  console.log('✅ Business rule settings created\n');

  // ── 6. Create default VAT tax rate ──────────────────────────────────────────
  await prisma.taxRate.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'VAT',
      },
    },
    create: {
      id: createId(),
      organizationId: org.id,
      name: 'VAT',
      code: 'VAT',
      rate: 7.5,
      description: 'Nigerian Value Added Tax',
      isDefault: true,
      isActive: true,
    },
    update: {},
  });
  console.log('✅ Default tax rate (VAT 7.5%) created\n');

  // ── 7. Development: create admin user ───────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const adminEmail = 'admin@knef.local';
    let adminUser = await prisma.user.findFirst({
      where: { organizationId: org.id, email: adminEmail },
    });

    if (!adminUser) {
      const passwordHash = await bcrypt.hash('Admin123!', 12);
      adminUser = await prisma.user.create({
        data: {
          id: createId(),
          organizationId: org.id,
          email: adminEmail,
          passwordHash,
          firstName: 'Admin',
          lastName: 'User',
          isActive: true,
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
      console.log('✅ Admin user created:', adminEmail);
    } else {
      console.log('ℹ️  Admin user already exists:', adminEmail);
    }

    // Assign SUPER_ADMIN role
    const superAdminRoleId = roleMap['SUPER_ADMIN'];
    if (superAdminRoleId) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId_locationId: {
            userId: adminUser.id,
            roleId: superAdminRoleId,
            locationId: '',
          },
        },
        create: {
          id: createId(),
          userId: adminUser.id,
          roleId: superAdminRoleId,
          locationId: null,
          assignedAt: new Date(),
        },
        update: {},
      }).catch(async () => {
        // Fallback: check if assignment already exists without unique constraint
        const existing = await prisma.userRole.findFirst({
          where: { userId: adminUser!.id, roleId: superAdminRoleId, locationId: null },
        });
        if (!existing) {
          await prisma.userRole.create({
            data: {
              id: createId(),
              userId: adminUser!.id,
              roleId: superAdminRoleId,
              locationId: null,
            },
          });
        }
      });
      console.log('✅ SUPER_ADMIN role assigned to admin user\n');
    }
  }

  // ── Email Templates ──────────────────────────────────────────────────────────
  const org = await prisma.organization.findFirst();
  if (org) {
    const TEMPLATES = [
      {
        name: 'Order Confirmation',
        type: 'email',
        subject: 'Your KNEF Gadgets Order {{orderReference}} is Confirmed!',
        body: `<h2>Thank you for your order!</h2><p>Hi {{customerName}},</p><p>We've received your order and it's being processed. Here are your order details:</p><ul><li><strong>Order Reference:</strong> {{orderReference}}</li><li><strong>Total Amount:</strong> {{orderTotal}}</li><li><strong>Payment Method:</strong> {{paymentMethod}}</li></ul><p>We'll notify you once your order is ready for pickup or dispatch.</p><p>If you have any questions, contact us at <strong>info@knefgadgets.com</strong> or call <strong>+234 800 000 0000</strong>.</p><p>Thank you for choosing KNEF Gadgets!</p>`,
      },
      {
        name: 'Order Shipped',
        type: 'email',
        subject: 'Your Order {{orderReference}} Has Been Shipped!',
        body: `<h2>Your order is on its way!</h2><p>Hi {{customerName}},</p><p>Great news! Your order <strong>{{orderReference}}</strong> has been shipped and is on its way to you.</p><p><strong>Estimated Delivery:</strong> {{estimatedDelivery}}</p><p>If you have any delivery concerns, please contact us immediately.</p><p>Thank you for shopping with KNEF Gadgets!</p>`,
      },
      {
        name: 'Order Ready for Pickup',
        type: 'email',
        subject: 'Your Order {{orderReference}} is Ready for Pickup',
        body: `<h2>Your order is ready!</h2><p>Hi {{customerName}},</p><p>Your order <strong>{{orderReference}}</strong> is now ready for pickup at our store.</p><p><strong>Pickup Location:</strong> {{pickupAddress}}</p><p><strong>Store Hours:</strong> Monday – Saturday, 9am – 6pm</p><p>Please bring a valid ID and your order reference number. This order will be held for <strong>7 days</strong>.</p><p>See you soon!</p>`,
      },
      {
        name: 'Payment Received',
        type: 'email',
        subject: 'Payment Confirmed for Order {{orderReference}}',
        body: `<h2>Payment Received</h2><p>Hi {{customerName}},</p><p>We have successfully received your payment of <strong>{{amount}}</strong> for order <strong>{{orderReference}}</strong>.</p><p><strong>Payment Reference:</strong> {{paymentReference}}</p><p>Your order is now being processed. You will receive another notification when it is ready.</p><p>Thank you!</p>`,
      },
      {
        name: 'Welcome Email',
        type: 'email',
        subject: 'Welcome to KNEF Gadgets, {{firstName}}!',
        body: `<h2>Welcome to KNEF Gadgets! 🎉</h2><p>Hi {{firstName}},</p><p>Thank you for creating an account with KNEF Gadgets — Lagos's trusted gadget store.</p><p>With your account you can:</p><ul><li>Track your orders in real time</li><li>Save your delivery addresses</li><li>View your full order history</li><li>Get exclusive member offers</li></ul><p>Start shopping today at <a href="https://knefgadgets.com">knefgadgets.com</a>.</p><p>If you need help, we're always here at <strong>info@knefgadgets.com</strong>.</p><p>Happy shopping!</p>`,
      },
      {
        name: 'Password Reset',
        type: 'email',
        subject: 'Reset Your KNEF Gadgets Password',
        body: `<h2>Password Reset Request</h2><p>Hi {{firstName}},</p><p>We received a request to reset your password. Click the button below to create a new password. This link is valid for <strong>30 minutes</strong>.</p><p style="text-align:center;"><a href="{{resetLink}}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a></p><p>If you didn't request a password reset, please ignore this email. Your account is safe.</p><p>— The KNEF Gadgets Team</p>`,
      },
      {
        name: 'OTP Verification',
        type: 'email',
        subject: 'Your KNEF Gadgets Verification Code: {{code}}',
        body: `<h2>Email Verification</h2><p>Hi {{firstName}},</p><p>Your verification code is:</p><p style="text-align:center;font-size:36px;font-weight:700;letter-spacing:8px;color:#2563eb;">{{code}}</p><p>This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p><p>If you didn't request this, please ignore this email.</p>`,
      },
      {
        name: 'Low Stock Alert',
        type: 'email',
        subject: '⚠️ Low Stock Alert: {{productName}}',
        body: `<h2>Low Stock Alert</h2><p>This is an automated alert from KNEF Business OS.</p><p>The following product is running low on stock:</p><ul><li><strong>Product:</strong> {{productName}}</li><li><strong>SKU:</strong> {{sku}}</li><li><strong>Current Stock:</strong> {{currentStock}} units</li><li><strong>Low Stock Threshold:</strong> {{threshold}} units</li><li><strong>Location:</strong> {{location}}</li></ul><p>Please reorder soon to avoid stockout.</p>`,
      },
      {
        name: 'Invoice',
        type: 'email',
        subject: 'Invoice {{invoiceNumber}} from KNEF Gadgets',
        body: `<h2>Invoice from KNEF Gadgets</h2><p>Hi {{customerName}},</p><p>Please find attached your invoice for order <strong>{{orderReference}}</strong>.</p><table style="width:100%;border-collapse:collapse;"><tr style="background:#f3f4f6;"><th style="padding:8px;text-align:left;">Description</th><th style="padding:8px;text-align:right;">Amount</th></tr><tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;">{{itemsSummary}}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">{{subtotal}}</td></tr><tr><td style="padding:8px;font-weight:600;">Total</td><td style="padding:8px;font-weight:600;text-align:right;">{{total}}</td></tr></table><p><strong>Due Date:</strong> {{dueDate}}</p><p>Pay via bank transfer to <strong>KNEF Gadgets — First Bank, 1234567890</strong>.</p>`,
      },
      {
        name: 'Promotional Offer',
        type: 'email',
        subject: '🔥 Special Offer Just for You — {{offerTitle}}',
        body: `<h2>{{offerTitle}}</h2><p>Hi {{customerName}},</p><p>We have an exclusive offer for you!</p><p style="font-size:18px;color:#2563eb;font-weight:700;">{{offerDescription}}</p><p><strong>Valid until:</strong> {{expiryDate}}</p><p style="text-align:center;"><a href="https://knefgadgets.com" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Shop Now</a></p><p>Don't miss out! This offer is limited.</p><p>— KNEF Gadgets Team</p>`,
      },
    ];

    for (const tpl of TEMPLATES) {
      await prisma.communicationTemplate.upsert({
        where: { organizationId_name_type: { organizationId: org.id, name: tpl.name, type: tpl.type } },
        create: { id: createId(), organizationId: org.id, ...tpl, isActive: true },
        update: {},
      });
    }
    console.log('✅ 10 email templates seeded\n');
  }

  console.log('🎉 Seed complete!\n');
}

function getRoleDescription(name: string): string {
  const descriptions: Record<string, string> = {
    SUPER_ADMIN: 'Full system access. All permissions.',
    MANAGING_DIRECTOR: 'Top-level executive with full business visibility.',
    GENERAL_MANAGER: 'Operational management across all departments.',
    SALES_MANAGER: 'Manages sales team, targets, and customer relationships.',
    SALES_STAFF: 'Point-of-sale and order entry.',
    INVENTORY_MANAGER: 'Full inventory control including adjustments and counts.',
    WAREHOUSE_STAFF: 'Receiving stock and physical inventory operations.',
    ACCOUNTANT: 'Financial records, expenses, and reporting.',
    HR_ADMIN: 'Staff management, attendance, and payroll.',
    ECOMMERCE_MANAGER: 'Online channel management and integrations.',
    CUSTOMER_SERVICE: 'Customer support and order inquiries.',
    AUDITOR: 'Read-only access to all records for audit purposes.',
  };
  return descriptions[name] ?? name;
}

seed()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
