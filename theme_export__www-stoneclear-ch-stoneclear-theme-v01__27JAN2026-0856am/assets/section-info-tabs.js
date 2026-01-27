if ( typeof InfoTabs !== 'function' ) {

	class InfoTabs extends HTMLElement {

		constructor(){

			super();
			
			this.tabs = this.querySelectorAll('.js-info-tab');
			this.panels = this.querySelectorAll('.js-info-panel');
			this.index = 0;
			this.timeout = null;
			this._timeoutInterval = parseInt(this.dataset.tabsAutoplayTimer*1000);

			this.zIndex = 99;
			
			if ( window.innerWidth < 768 ) {
				this.dataset.tabsAutoplay = "false";
			}

			if (this.dataset.tabsAutoplay == "true" && this.tabs.length > 1 ) {
				this.autoplay(this._timeoutInterval, true);
				this.querySelector('.info-tabs_togglers').addEventListener('mouseover', () => {
					if ( this.timeout > 0 ) {
						this._timeoutRemaining = this._timeoutInterval - (new Date().getTime() - this._timeoutStart);
						clearTimeout(this.timeout);
						this.timeout = 0;
					}
				});

				this.querySelector('.info-tabs_togglers').addEventListener('mouseleave', () => {
					this.autoplay(this._timeoutRemaining, true);
					this._timeoutInterval = this._timeoutRemaining;
				});
				
			}

			this.tabs.forEach(tab => {

				tab.addEventListener('click', e=>{
					if ( ! e.currentTarget.classList.contains('active') ) {

						const panelID = e.currentTarget.getAttribute('rel');
						const panel = document.getElementById(`panel-${panelID}`);
						this.reset();
						
						this.index = parseInt(e.currentTarget.dataset.index);
						e.currentTarget.classList.add("active");

						if(!document.body.classList.contains('no-touchevents') && window.innerWidth < 767) {
							this.querySelector('.info-tabs_togglers').scrollTo({
								left: e.currentTarget.offsetLeft - 40,
								behavior: 'smooth'
							})
						}
						
						this.slideDown(e.currentTarget.querySelector('.info-tabs__tab-caption'), 200);

						panel.classList.add("active");
						panel.style.zIndex = ++this.zIndex;
						panel.style.opacity = 1;

					}
				});

			}); 		

		}

		autoplay(delay, reset = false) {
			if ( reset ) {
				this._timeoutStart = new Date().getTime();
			}
			this.timeout = setTimeout(()=>{
				if (this.index + 1 >= this.tabs.length) {
					this.index = 0;
				} else {
					this.index++;
				}
				this.tabs[this.index].click();
				this._timeoutInterval = parseInt(this.dataset.tabsAutoplayTimer*1000);
				this.autoplay(this._timeoutInterval, true);
			}, delay);
		}	

		reset() {
			clearTimeout(this.timeout);
			this._timeoutInterval = parseInt(this.dataset.tabsAutoplayTimer*1000);
			this._timeoutRemaining = this._timeoutInterval;
			this.querySelectorAll('.active').forEach(elm => {
				if ( elm.querySelector('.info-tabs__tab-caption') ) {
					this.slideUp(elm.querySelector('.info-tabs__tab-caption'), 200);
				}
				elm.classList.remove('active');
			});
		}

		slideUp(target, duration){
			if ( window.innerWidth >= 768 ) {
				target.style.transitionProperty = 'height, margin, padding';
				target.style.transitionDuration = duration + 'ms';
				target.style.boxSizing = 'border-box';
				target.style.height = target.offsetHeight + 'px';
				target.offsetHeight;
				target.style.overflow = 'hidden';
				target.style.height = 0;
				target.style.paddingTop = 0;
				target.style.paddingBottom = 0;
				target.style.marginTop = 0;
				target.style.marginBottom = 0;
				setTimeout(()=>{
					target.style.display = 'none';
					target.style.removeProperty('height');
					target.style.removeProperty('padding-top');
					target.style.removeProperty('padding-bottom');
					target.style.removeProperty('margin-top');
					target.style.removeProperty('margin-bottom');
					target.style.removeProperty('overflow');
					target.style.removeProperty('transition-duration');
					target.style.removeProperty('transition-property');
				}, duration);
			}
		}
		slideDown(target, duration) {
			if ( window.innerWidth >= 768 ) {
				target.style.removeProperty('display');
				var display = window.getComputedStyle(target).display;

				if (display === 'none')
					display = 'block';

				target.style.display = display;
				var height = target.offsetHeight;
				target.style.overflow = 'hidden';
				target.style.height = 0;
				target.style.paddingTop = 0;
				target.style.paddingBottom = 0;
				target.style.marginTop = 0;
				target.style.marginBottom = 0;
				target.offsetHeight;
				target.style.boxSizing = 'border-box';
				target.style.transitionProperty = "height, margin, padding";
				target.style.transitionDuration = duration + 'ms';
				target.style.height = height + 'px';
				target.style.removeProperty('padding-top');
				target.style.removeProperty('padding-bottom');
				target.style.removeProperty('margin-top');
				target.style.removeProperty('margin-bottom');
				setTimeout(()=>{
					target.style.removeProperty('height');
					target.style.removeProperty('overflow');
					target.style.removeProperty('transition-duration');
					target.style.removeProperty('transition-property');
				}, duration);
			}
		}

	}

  if ( typeof customElements.get('info-tabs') == 'undefined' ) {
    customElements.define('info-tabs', InfoTabs);
	}

}