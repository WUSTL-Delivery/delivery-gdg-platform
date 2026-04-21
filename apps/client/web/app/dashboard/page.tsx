"use client"
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const router = useRouter()
  
  const vendors = [
    {
      name: "Subway",
      time: "10 min",
      image: "/SubWay.avif",
      slug: "Subway"
    },
    {
      name: "BeastCraft",
      time: "20 min",
      image: "/BeastCraft.jpg",
      slug: "Beastcraft"
    },
    {
      name: "Fattened Caf",
      time: "10 min",
      image: "/FattenedCaf.jpg",
      slug: "fattened-caf"
    },
    {
      name: "Collins Farms",
      time: "10 min",
      image: "/CollinsFarm.png",
      slug: "collins-farms"
    },
    {
      name: "LaJoy's Coffee",
      time: "10 min",
      image: "/LaJoys.jpg",
      slug: "lajoys-coffee"
    },
    {
      name: "CoffeeStamp",
      time: "10 min",
      image: "/CoffeeStamp.jpg",
      slug: "coffeestamp"
    },
    {
      name: "Cafe Bergson",
      time: "30 min",
      image: "/CafeBergson.png",
      slug: "cafe-bergson"
    },
    {
      name: "Corner 17",
      time: "10 min",
      image: "/Corner17.jpg",
      slug: "corner-17"
    }
  ]

  const handleVendorClick = (slug: string) => {
    router.push(`/dashboard/${slug}`)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#E8D5FF' }}>
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center">
              <h1 className="text-5xl font-bold text-black">Order Here</h1>
            </div>
            <div className="flex items-center gap-4">
              {/* WashU Logo */}
              <img 
                src="/WashU.png" 
                alt="WashU Logo" 
                className="h-10 w-auto"
              />
              <button className="bg-green-500 hover:bg-green-600 text-white font-semibold px-5 py-2.5 rounded-md transition-colors text-sm">
                $1,500 on your campus card
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {vendors.map((vendor, index) => (
            <div
              key={index}
              onClick={() => handleVendorClick(vendor.slug)}
              className="bg-white rounded-2xl overflow-hidden border border-purple-300 hover:shadow-xl transition-all cursor-pointer transform hover:scale-105"
            >
              {/* Vendor Image */}
              <div className="w-full h-56 bg-gray-100 relative">
                <img
                  src={vendor.image}
                  alt={vendor.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to a gradient placeholder
                    const target = e.currentTarget as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-200 to-purple-300"><span class="text-purple-700 font-bold text-2xl">${vendor.name}</span></div>`;
                    }
                  }}
                />
              </div>

              {/* Vendor Info */}
              <div className="p-5 bg-white">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{vendor.name}</h3>
                <p className="text-sm text-gray-600 mb-4">{vendor.time}</p>
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    handleVendorClick(vendor.slug)
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
                >
                  Select
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
