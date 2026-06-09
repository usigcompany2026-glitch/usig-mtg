// ===================================
// USIG AI - ENHANCED LEAD FORM
// Multi-step, Scoring, GHL Integration
// ===================================

const CONFIG = {
    ghlLocationId: 'x0HFnEGuUCweDyholAxD',
    webhookUrl: '/.netlify/functions/submit-lead',
    formId: 'leadForm',
    creMinimum: 1000000, // $1M minimum for CRE
    residentialMinimum: 100000 // $100K minimum for residential
};

let currentStep = 1;
let formData = {
    loanType: null,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    warmScore: 0,
    leadQuality: 'cold'
};

// ===================================
// STEP NAVIGATION
// ===================================

function showStep(step) {
    // Hide all steps
    document.querySelectorAll('.form-step').forEach(s => {
        s.classList.remove('active');
    });

    // Show correct step based on loan type
    const loanType = formData.loanType;
    const stepsToShow = document.querySelectorAll(`.form-step[data-step="${step}"]`);
    
    stepsToShow.forEach(s => {
        if (step === 1) {
            s.classList.add('active');
        } else if (step === 2) {
            if (s.dataset.loanType === loanType) {
                s.classList.add('active');
            }
        } else if (step === 3) {
            s.classList.add('active');
        }
    });

    // Update step indicator
    updateStepIndicator(step);

    // Update review section if step 3
    if (step === 3) {
        updateReview();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    currentStep = step;
}

function updateStepIndicator(activeStep) {
    document.querySelectorAll('.step').forEach((step, idx) => {
        if (idx + 1 === activeStep) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
}

function nextStep() {
    if (validateStep(currentStep)) {
        if (currentStep === 1) {
            // Get loan type from radio
            formData.loanType = document.querySelector('input[name="loanType"]:checked')?.value;
        }
        showStep(currentStep + 1);
    }
}

function prevStep() {
    showStep(currentStep - 1);
}

// ===================================
// VALIDATION
// ===================================

function validateStep(step) {
    const form = document.getElementById(CONFIG.formId);
    
    if (step === 1) {
        const loanType = document.querySelector('input[name="loanType"]:checked');
        if (!loanType) {
            alert('Please select a loan type');
            return false;
        }
        return true;
    }

    if (step === 2) {
        // Get all visible fields in step 2
        const activeStep2 = document.querySelector(`.form-step[data-step="2"].active`);
        const inputs = activeStep2.querySelectorAll('input[required], select[required], textarea[required]');
        
        let isValid = true;
        inputs.forEach(input => {
            if (!input.value.trim()) {
                input.style.borderColor = '#ef4444';
                isValid = false;
            } else {
                input.style.borderColor = '';
            }
        });

        // Validate checkboxes (at least one must be selected for certain groups)
        const loanTypeCheckboxes = activeStep2.querySelectorAll('input[name="loanTypes"]:checked');
        const loanPurposeCheckboxes = activeStep2.querySelectorAll('input[name="loanPurpose"]:checked');
        
        if (loanTypeCheckboxes.length === 0 && activeStep2.querySelector('input[name="loanTypes"]')) {
            alert('Please select at least one loan type');
            return false;
        }

        if (loanPurposeCheckboxes.length === 0 && activeStep2.querySelector('input[name="loanPurpose"]')) {
            alert('Please select at least one loan purpose');
            return false;
        }

        return isValid;
    }

    if (step === 3) {
        const consent = document.getElementById('consent');
        if (!consent.checked) {
            alert('Please agree to be contacted');
            return false;
        }
        return true;
    }

    return true;
}

// ===================================
// DATA COLLECTION & SCORING
// ===================================

function updateReview() {
    // Get current values
    const firstName = document.querySelector('input[name="firstName"]')?.value || '';
    const lastName = document.querySelector('input[name="lastName"]')?.value || '';
    const email = document.querySelector('input[name="email"]')?.value || '';
    const phone = document.querySelector('input[name="phone"]')?.value || '';
    const loanType = formData.loanType === 'cre' ? 'Commercial Real Estate' : 'Residential';

    document.getElementById('reviewName').textContent = `${firstName} ${lastName}`;
    document.getElementById('reviewEmail').textContent = email;
    document.getElementById('reviewPhone').textContent = phone;
    document.getElementById('reviewLoanType').textContent = loanType;

    // Collect all form data for scoring
    collectAllFormData();
    scoreAndClassifyLead();
}

function collectAllFormData() {
    const form = document.getElementById(CONFIG.formId);
    const formDataObj = new FormData(form);

    formData.firstName = formDataObj.get('firstName');
    formData.lastName = formDataObj.get('lastName');
    formData.email = formDataObj.get('email');
    formData.phone = formDataObj.get('phone');

    // Collect all other fields
    formData.allFields = {};
    for (let [key, value] of formDataObj.entries()) {
        if (!formData.allFields[key]) {
            formData.allFields[key] = [];
        }
        formData.allFields[key].push(value);
    }
}

// ===================================
// LEAD SCORING & CLASSIFICATION
// ===================================

function scoreAndClassifyLead() {
    let score = 0;
    const loanType = formData.loanType;

    if (loanType === 'cre') {
        // CRE Scoring
        const loanAmount = parseInt(document.querySelector('input[name="loanAmount"]')?.value || 0);
        const dscr = parseFloat(document.querySelector('input[name="dscr"]')?.value || 0);
        const yearsExp = document.querySelector('select[name="yearsExperience"]')?.value;
        const timeline = document.querySelector('select[name="timeline"]')?.value;

        // Minimum amount check
        if (loanAmount >= CONFIG.creMinimum) {
            score += 30;
        } else if (loanAmount > 0) {
            // Below minimum = cold
            formData.leadQuality = 'cold';
            formData.creQualReason = `Loan amount $${(loanAmount).toLocaleString()} below $1M minimum`;
            return;
        }

        // DSCR check (good if 1.2+)
        if (dscr >= 1.2) score += 20;

        // Experience check
        if (yearsExp === '10plus' || yearsExp === '5-10') score += 15;

        // Timeline urgency
        if (timeline === '0-30' || timeline === '30-60') score += 15;

        // Loan type preference (DSCR, conventional = warm)
        const loanTypePrefs = document.querySelectorAll('input[name="loanTypes"]:checked');
        const hasDscr = Array.from(loanTypePrefs).some(el => el.value === 'dscr');
        const hasConventional = Array.from(loanTypePrefs).some(el => el.value === 'conventional');
        if (hasDscr || hasConventional) score += 10;

        // Exit strategy defined
        const exitStrategy = document.querySelector('select[name="exitStrategy"]')?.value;
        if (exitStrategy && exitStrategy !== 'uncertain') score += 10;

    } else if (loanType === 'residential') {
        // Residential Scoring
        const loanAmount = parseInt(document.querySelector('input[name="loanAmount"]')?.value || 0);
        const creditScore = document.querySelector('select[name="creditScore"]')?.value;
        const dti = document.querySelector('select[name="dti"]')?.value;
        const employmentStatus = document.querySelector('select[name="employmentStatus"]')?.value;
        const timeline = document.querySelector('select[name="timeline"]')?.value;

        // Minimum loan amount check
        if (loanAmount < CONFIG.residentialMinimum) {
            formData.leadQuality = 'cold';
            formData.resQualReason = `Loan amount $${(loanAmount).toLocaleString()} below $100K minimum`;
            return;
        }

        score += 30;

        // Credit score check (740+ = excellent)
        if (creditScore === '740-plus') {
            score += 25;
        } else if (creditScore === '680-740') {
            score += 15;
        } else if (creditScore === '640-680') {
            score += 8;
        }

        // DTI check (lower is better)
        if (dti === 'less-20') {
            score += 20;
        } else if (dti === '20-30') {
            score += 15;
        } else if (dti === '30-40') {
            score += 8;
        }

        // Employment status
        if (employmentStatus === 'employed') {
            score += 15;
        } else if (employmentStatus === 'self-employed') {
            score += 10;
        }

        // Timeline
        if (timeline === '0-30' || timeline === '30-60') {
            score += 10;
        }

        // Owner-occupied = warm
        const ownerOcc = document.querySelector('input[name="ownerOccupied"]:checked')?.value;
        if (ownerOcc === 'yes') {
            score += 5;
        }
    }

    formData.warmScore = score;

    // Classification: Warm if score >= 60, otherwise cold
    if (score >= 60) {
        formData.leadQuality = 'warm';
    } else {
        formData.leadQuality = 'cold';
    }
}

// ===================================
// FORM SUBMISSION
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById(CONFIG.formId);
    const submitBtn = document.getElementById('submitBtn');

    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!validateStep(3)) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
            const payload = buildGHLPayload();
            
            // Submit to backend
            const response = await fetch(CONFIG.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            // Show success
            document.getElementById('successMessage').style.display = 'block';
            form.reset();
            formData = { loanType: null };
            currentStep = 1;
            showStep(1);

            // Scroll to success message
            document.getElementById('successMessage').scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error('Submission error:', error);
            document.getElementById('errorMessage').textContent = '⚠ Error: ' + error.message;
            document.getElementById('errorMessage').style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Application';
        }
    });
});

// ===================================
// BUILD GHL PAYLOAD
// ===================================

function buildGHLPayload() {
    const contactFirstName = document.querySelector('input[name="firstName"]').value;
    const contactLastName = document.querySelector('input[name="lastName"]').value;
    const contactEmail = document.querySelector('input[name="email"]').value;
    const contactPhone = document.querySelector('input[name="phone"]').value;
    const loanType = formData.loanType;

    // Build opportunity
    const opportunity = {
        locationId: CONFIG.ghlLocationId,
        name: `${formData.leadQuality.toUpperCase()} - ${loanType === 'cre' ? 'CRE' : 'Residential'} - ${contactFirstName} ${contactLastName}`,
        pipelineStageId: 'new_lead', // Map to your GHL pipeline stage
        description: buildOpportunityDescription(),
        monetaryValue: extractLoanAmount(),
        
        // Contact info
        contactFirstName: contactFirstName,
        contactLastName: contactLastName,
        contactEmail: contactEmail,
        contactPhone: contactPhone,
        
        // Tags (critical for routing)
        tags: buildTags(),
        
        // Custom fields
        customFields: buildCustomFields(),
        
        // Metadata
        status: formData.leadQuality === 'warm' ? 'active' : 'nurture',
        leadScore: formData.warmScore,
        submittedDate: new Date().toISOString()
    };

    return opportunity;
}

function buildOpportunityDescription() {
    const loanType = formData.loanType;
    let description = '';

    if (loanType === 'cre') {
        const propertyType = document.querySelector('select[name="propertyType"]')?.value;
        const loanAmount = parseInt(document.querySelector('input[name="loanAmount"]')?.value || 0);
        const noi = parseInt(document.querySelector('input[name="noi"]')?.value || 0);
        const dscr = parseFloat(document.querySelector('input[name="dscr"]')?.value || 0);

        description = `
CRE Opportunity:
Property Type: ${propertyType}
Loan Amount: $${loanAmount.toLocaleString()}
Annual NOI: $${noi.toLocaleString()}
Estimated DSCR: ${dscr.toFixed(2)}x
Lead Quality: ${formData.leadQuality.toUpperCase()}
Qualification Score: ${formData.warmScore}/100
        `.trim();
    } else {
        const propertyType = document.querySelector('input[name="propertyType"]:checked')?.value;
        const loanAmount = parseInt(document.querySelector('input[name="loanAmount"]')?.value || 0);
        const creditScore = document.querySelector('select[name="creditScore"]')?.value;
        const dti = document.querySelector('select[name="dti"]')?.value;

        description = `
Residential Mortgage:
Property Type: ${propertyType}
Loan Amount: $${loanAmount.toLocaleString()}
Credit Score: ${creditScore}
Current DTI: ${dti}
Lead Quality: ${formData.leadQuality.toUpperCase()}
Qualification Score: ${formData.warmScore}/100
        `.trim();
    }

    return description;
}

function buildTags() {
    const tags = [
        formData.loanType === 'cre' ? 'mortgage-cre' : 'mortgage-residential',
        `lead-quality-${formData.leadQuality}`,
        'usig-form-submission',
        new Date().toISOString().split('T')[0]
    ];

    // Add sub-tags for CRE
    if (formData.loanType === 'cre') {
        tags.push('ai-text-nurture-cre');
        if (formData.leadQuality === 'warm') {
            tags.push('immediate-follow-up');
        } else {
            tags.push('90-day-follow-up');
        }
    } else {
        tags.push('ai-text-nurture-residential');
        if (formData.leadQuality === 'warm') {
            tags.push('immediate-follow-up');
        } else {
            tags.push('90-day-follow-up');
        }
    }

    return tags;
}

function buildCustomFields() {
    const loanType = formData.loanType;
    const fields = {
        'Lead_Quality': formData.leadQuality,
        'Qualification_Score': formData.warmScore.toString(),
        'Loan_Type': loanType === 'cre' ? 'Commercial Real Estate' : 'Residential',
        'Submitted_Via': 'USIG Form - Enhanced',
    };

    if (loanType === 'cre') {
        fields['CRE_Property_Type'] = document.querySelector('select[name="propertyType"]')?.value;
        fields['CRE_Loan_Amount'] = document.querySelector('input[name="loanAmount"]')?.value;
        fields['CRE_NOI'] = document.querySelector('input[name="noi"]')?.value;
        fields['CRE_DSCR'] = document.querySelector('input[name="dscr"]')?.value;
        fields['CRE_Cap_Rate'] = document.querySelector('input[name="capRate"]')?.value;
        fields['Investor_Experience'] = document.querySelector('select[name="yearsExperience"]')?.value;
        fields['Portfolio_Size'] = document.querySelector('select[name="portfolioSize"]')?.value;
    } else {
        fields['Residential_Property_Type'] = document.querySelector('input[name="propertyType"]:checked')?.value;
        fields['Residential_Loan_Amount'] = document.querySelector('input[name="loanAmount"]')?.value;
        fields['Credit_Score_Range'] = document.querySelector('select[name="creditScore"]')?.value;
        fields['DTI'] = document.querySelector('select[name="dti"]')?.value;
        fields['Employment_Status'] = document.querySelector('select[name="employmentStatus"]')?.value;
    }

    return fields;
}

function extractLoanAmount() {
    if (formData.loanType === 'cre') {
        return parseInt(document.querySelector('input[name="loanAmount"]')?.value || 0);
    } else {
        return parseInt(document.querySelector('input[name="loanAmount"]')?.value || 0);
    }
}

// ===================================
// INITIALIZE
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    showStep(1);

    // Phone formatting
    document.querySelectorAll('input[name="phone"]').forEach(input => {
        input.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 0) {
                if (value.length <= 3) {
                    value = value;
                } else if (value.length <= 6) {
                    value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
                } else {
                    value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
                }
            }
            e.target.value = value;
        });
    });

    // Currency formatting
    document.querySelectorAll('input[type="number"]').forEach(input => {
        if (input.name.includes('Amount') || input.name.includes('Price') || input.name.includes('Value') || input.name.includes('noi') || input.name.includes('Income')) {
            input.addEventListener('blur', function(e) {
                if (e.target.value) {
                    const value = parseInt(e.target.value);
                    e.target.value = value.toLocaleString('en-US');
                }
            });
            input.addEventListener('focus', function(e) {
                e.target.value = e.target.value.replace(/,/g, '');
            });
        }
    });
});

console.log('USIG AI Enhanced Form Ready');
