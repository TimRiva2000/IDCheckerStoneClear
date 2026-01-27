if (typeof BeforeAfter !== "function") {
	class BeforeAfter extends HTMLElement {

		constructor() {

			super();

			this.container = this.querySelector(".before-after");
			this.slider = this.querySelector(".before-after__slider");

			this.slider.addEventListener("input", (e) => {
				this.container.style.setProperty('--position', `${e.target.value}%`);
			});

			this.slider.addEventListener("change", (e) => {
				this.container.style.setProperty('--position', `${e.target.value}%`);
			});

			if ( this.classList.contains('invert-layout') ) {

				this.originalLayout = this.dataset.layout;

				this.RESIZE_WATCHER = debounce(()=>{
					const afterContent = window.getComputedStyle(this,':after').content;
					if ( afterContent.includes('invert-layout') && this.dataset.layout === this.originalLayout ) {
						this.invertLayout();
					} else if ( ! afterContent.includes('invert-layout') && this.dataset.layout !== this.originalLayout )  { 
						this.invertLayout();
					}
				}, 100);
				window.addEventListener('resize', this.RESIZE_WATCHER);
				this.RESIZE_WATCHER();

			}

		}

		invertLayout() {
			this.dataset.layout = this.dataset.layout === 'vertical' ? 'horizontal' : 'vertical';
			this.setAttribute('data-layout', this.dataset.layout);
			this.querySelector('input[type="range"]').setAttribute('orient', this.dataset.layout);
		}

	}

	if (typeof customElements.get("before-after") == "undefined") {
		customElements.define("before-after", BeforeAfter);
	}
}
