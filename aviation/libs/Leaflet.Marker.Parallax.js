L.Marker.Parallax = L.Marker.extend({
    _initIcon: function() {
        L.Marker.prototype._initIcon.call(this);
        var anchor = this.options.icon.options.iconAnchor ? L.point(this.options.icon.options.iconAnchor) : L.point([0, 0]);
        this.options.icon._originalOffset = L.point(-anchor.x, -anchor.y);
    },

    onAdd: function(e) {
        L.Marker.prototype.onAdd.call(this, e);
        this._map.on('move', this._onMapMove, this);
        if (this._map.options.zoomAnimation && L.Browser.any3d) {
            this._map.on('zoomanim', this._animateZoom, this);
        }
        this._onMapMove();
    },

    onRemove: function(e) {
        this._map.off('move', this._onMapMove, this);
        if (this._map.options.zoomAnimation) {
            this._map.off('zoomanim', this._animateZoom, this);
        }
        L.Marker.prototype.onRemove.call(this, e);
    },

    _onMapMove: function() {
        var offsets = this._calculateOffsetFromOrigin(this._map.getCenter());

        if (this._icon) {
            this._updateIconOffset(offsets.centerOffset);
        }
    },

    _animateZoom: function(e) {
        L.Marker.prototype._animateZoom.call(this, e);

        // calculate the "future" offset and parallax based on the
        // _animateZoom's info on the map's next center and zoom
        var offset = this._calculateOffsetFromOrigin(e.center);
        var parallax = this._calculateParallaxFromOffset(e.zoom, offset);

        this._icon.style.marginLeft = parallax.x + 'px';
        this._icon.style.marginTop = parallax.y + 'px';
    },

    _calcLatLngFromOffset: function() {
        var offsets = this._calculateOffsetFromOrigin(this._map.getCenter());
        var parallax = this._calculateParallaxFromOffset(this._map.getZoom(), offsets.centerOffset);

        var containerPoint = offsets.containerPoint.add(parallax);
        var markerLatLng = this._map.containerPointToLatLng(containerPoint);

        // console.log('@ containerPoint: ', containerPoint);
        // console.log('@ got markerLatLng', markerLatLng);

        return markerLatLng;
    },

    _updateIconOffset: function(offset) {
        if (!offset || !this._icon) { return; }

        var parallax = this._calculateParallaxFromOffset(this._map.getZoom(), offset);
        var originalOffset = this.options.icon._originalOffset;

        var newOffset = originalOffset.add(parallax);

        this._icon.style.marginLeft = newOffset.x + 'px';
        this._icon.style.marginTop = newOffset.y + 'px';
    },

    //Find how much from the center of the map the marker is currently located
    _calculateOffsetFromOrigin: function(center) {
        if (!this._map) { return; }

        var latlng = this.getLatLng();
        var markerPoint = this._map.latLngToContainerPoint(latlng);
        // var centerPoint = this._map.getSize().divideBy(2);
        var centerPoint = this._map.latLngToContainerPoint(center);
        //User centerPoint and markerPoint to calculate the distance from center

        var deltaX = (markerPoint.x - centerPoint.x);
        var deltaY = (markerPoint.y - centerPoint.y);

        var offset = { x: deltaX, y: deltaY };
        var containerPoint = markerPoint.add(offset);

        return { containerPoint: containerPoint, centerOffset: offset };
        // targetPoint = centerPoint.subtract([overlayWidth, 0]),
        // targetLatLng = map.containerPointToLatLng(centerPoint);
    },

    _calculateParallaxFromOffset: function(zoom, offset) {
        var parallax = L.point([0, 0]);

        if (!this.options.parallaxZoffset) {
            return parallax;
        }

        //Multiplies the delta x with a factor depending on the map z.
        var constFactor = this.options.parallaxZoffset * 0.000001;
        var moveFactor = constFactor * Math.pow(2, zoom);

        parallax.x = offset.x * moveFactor;
        parallax.y = offset.y * moveFactor;

        return parallax;
    }
});

L.Marker.parallax = function(latlng, opts) { return new L.Marker.Parallax(latlng, opts); };
