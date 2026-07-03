const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const handlers = `
  const handleDeleteBooking = (id: string) => {
    if (confirm('¿Estás seguro de que quieres eliminar este registro?')) {
      setBookings(prev => {
        const updated = prev.filter(b => b.id !== id);
        localStorage.setItem('travel_bookings', JSON.stringify(updated));
        return updated;
      });
      showToast('Registro eliminado', 'info');
    }
  };

  const handleViewDocument = (booking: TravelBooking) => {
    if (booking.id.startsWith('local-')) {
      showToast('No es posible previsualizar documentos locales previamente subidos.', 'error');
    } else {
      window.open(\`https://drive.google.com/file/d/\${booking.id}/view\`, '_blank');
    }
  };
`;

code = code.replace(/const handleMoveToTrip =/, handlers + '\n  const handleMoveToTrip =');

const bookingCardProps = `onDelete={handleDeleteBooking}
                            onViewDocument={handleViewDocument}
                            onReanalyze`;

code = code.replace(/onReanalyze/g, bookingCardProps);
// But wait, there are multiple onReanalyze maybe?
