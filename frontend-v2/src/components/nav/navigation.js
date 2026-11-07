// Single source for desktop and mobile navigation. Only existing routes.
export const ADMIN_NAV = [
  { title: 'Operations', items: [
    ['Console', '/admin/dashboard'],
    ['Events', '/admin/events'],
    ['Face ops', '/admin/face-ops'],
    ['Fulfillment', '/admin/fulfillment'],
    ['Custom Requests', '/admin/custom-requests'],
    ['Build queue', '/admin/build-queue'],
    ['Delivery', '/admin/delivery'],
    ['QR analytics', '/admin/qr-analytics'],
  ] },
  { title: 'Customer', items: [
    ['Support', '/admin/support'],
    ['Disputes', '/admin/disputes'],
    ['Approvals', '/admin/approvals'],
    ['Moderation', '/admin/moderation'],
  ] },
  { title: 'Money', items: [
    ['Pricing hub', '/admin/pricing'],
    ['Profitability', '/admin/profitability'],
    ['Business intelligence', '/admin/bi'],
    ['Marketplace', '/admin/marketplace'],
    ['Feature wishes', '/admin/feature-wishes'],
  ] },
  { title: 'Platform', items: [
    ['System health', '/admin/system-health'],
    ['Feature flags', '/admin/feature-flags'],
    ['Storage', '/admin/storage'],
    ['Storage pool', '/admin/storage-pool'],
    ['Cameras', '/admin/cameras'],
    ['Access control', '/admin/access-control'],
    ['Investigation', '/admin/investigation'],
    ['Food donation', '/admin/food-donation'],
  ] },
];
export const STUDIO_NAV = [
  {
    "title": "Workspace",
    "items": [
      [
        "Overview",
        "/studio/dashboard"
      ],
      [
        "Clients",
        "/studio/clients"
      ],
      [
        "Invitations",
        "/studio/invitations"
      ],
      [
        "Storage",
        "/studio/storage"
      ],
      [
        "Calendar",
        "/studio/calendar"
      ],
      [
        "Messages",
        "/studio/messages"
      ],
      [
        "Notifications",
        "/studio/notifications"
      ]
    ]
  },
  {
    "title": "Creative",
    "items": [
      [
        "Portfolio",
        "/studio/portfolio"
      ],
      [
        "Designs",
        "/studio/designs"
      ],
      [
        "Community",
        "/studio/community"
      ],
      [
        "Pixora hub",
        "/studio/pixora"
      ],
      [
        "AI tools",
        "/studio/ai-tools"
      ],
      [
        "Directory",
        "/studio/directory"
      ]
    ]
  },
  {
    "title": "Business",
    "items": [
      [
        "Orders",
        "/studio/orders"
      ],
      [
        "Plans",
        "/studio/plans"
      ],
      [
        "Earnings",
        "/studio/earnings"
      ],
      [
        "Insights",
        "/studio/insights"
      ]
    ]
  },
  {
    "title": "Settings",
    "items": [
      [
        "Team",
        "/studio/staff"
      ],
      [
        "Security",
        "/studio/security"
      ],
      [
        "Backup",
        "/studio/backup"
      ],
      [
        "Branding",
        "/studio/white-label"
      ],
      [
        "Activity log",
        "/studio/audit-logs"
      ]
    ]
  }
];
export const NAV_PANELS = {studio:{brand:"Pixora Studio",home:"/studio/dashboard",groups:STUDIO_NAV},admin:{brand:"Pixora Console",home:"/admin/dashboard",groups:ADMIN_NAV}};
